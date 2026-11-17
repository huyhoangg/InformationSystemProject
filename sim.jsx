const Sim = (() => {
  const DT = 0.2;
  const MAX_RANGE = 4.0;
  const WORLD = { w: 20, h: 14 };
  const GOAL = { x: 18, y: 2, reach: 0.6 };
  const START = { x: 2, y: 12 };
  const ROBOT = { radius: 0.3, vMax: 0.45, wMax: 1.1 };
  const TIMEOUT = 360;
  const OBSTACLES = [
    [4.5, 3.0, 1.0, 5.0],
    [4.5, 9.0, 1.0, 4.0],
    [9.0, 3.0, 1.0, 5.0],
    [9.0, 9.0, 1.0, 4.0],
    [13.5, 6.0, 1.0, 6.0],
    [16.2, 3.6, 0.9, 0.9],
  ];
  const SECTORS = [
    { key: "front", label: "Front", a0: -15, a1: 15 },
    { key: "front_left", label: "Front-left", a0: 15, a1: 60 },
    { key: "left", label: "Left", a0: 60, a1: 120 },
    { key: "front_right", label: "Front-right", a0: -60, a1: -15 },
    { key: "right", label: "Right", a0: -120, a1: -60 },
  ];
  const CLASSES = ["FORWARD", "LEFT", "RIGHT", "STOP"];

  // ---- Model registry (FR-08 · FR-09 · FR-10 · FR-11) ----
  const MODELS = [
    {
      id: "rf_v14", algo: "Random Forest", version: "v1.4", file: "random_forest_v1.4.pkl", size: "2.8 MB",
      params: "n_estimators = 200 · max_depth = 8", trained: "2026-10-28 21:14", trainTime: "3m 42s",
      samples: 18440, features: 8, dataset: "ds_warehouse_v3", infer: 1.8,
      val: { acc: 94.2, precision: 93.8, recall: 94.0, f1: 93.9 },
      err: 0.055, status: "deployed",
    },
    {
      id: "dt_v12", algo: "Decision Tree", version: "v1.2", file: "decision_tree_v1.2.pkl", size: "0.4 MB",
      params: "max_depth = 10 · criterion = gini", trained: "2026-10-28 20:47", trainTime: "0m 38s",
      samples: 18440, features: 8, dataset: "ds_warehouse_v3", infer: 0.3,
      val: { acc: 92.1, precision: 91.6, recall: 91.9, f1: 91.7 },
      err: 0.085, status: "candidate",
    },
    {
      id: "knn_v11", algo: "KNN", version: "v1.1", file: "knn_v1.1.pkl", size: "5.1 MB",
      params: "k = 7 · metric = euclidean", trained: "2026-10-27 18:05", trainTime: "0m 12s",
      samples: 18440, features: 8, dataset: "ds_warehouse_v3", infer: 4.6,
      val: { acc: 90.8, precision: 90.1, recall: 90.5, f1: 90.3 },
      err: 0.105, status: "candidate",
    },
    {
      id: "gnb_v10", algo: "Gaussian NB", version: "v1.0", file: "gaussian_nb_v1.0.pkl", size: "0.02 MB",
      params: "var_smoothing = 1e-9", trained: "2026-10-27 17:52", trainTime: "0m 05s",
      samples: 18440, features: 8, dataset: "ds_warehouse_v2", infer: 0.1,
      val: { acc: 87.5, precision: 86.9, recall: 87.2, f1: 87.0 },
      err: 0.145, status: "candidate",
    },
  ];

  // Navigation-level session archive per model (FR-16) — mock history from previous runs
  const NAV_HISTORY = {
    rf_v14: { runs: 12, success: 92, collision: 8, avgTime: 142, avgDist: 23.6 },
    dt_v12: { runs: 10, success: 80, collision: 20, avgTime: 161, avgDist: 25.1 },
    knn_v11: { runs: 10, success: 70, collision: 30, avgTime: 178, avgDist: 26.8 },
    gnb_v10: { runs: 8, success: 50, collision: 50, avgTime: 214, avgDist: 29.3 },
  };

  const normAngle = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const pointInRects = (x, y, pad) => {
    if (x < pad || x > WORLD.w - pad || y < pad || y > WORLD.h - pad) return true;
    for (const [rx, ry, rw, rh] of OBSTACLES) {
      if (x >= rx - pad && x <= rx + rw + pad && y >= ry - pad && y <= ry + rh + pad) return true;
    }
    return false;
  };

  const rayDistance = (x, y, ang) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let t = 0.08; t <= MAX_RANGE; t += 0.06) {
      if (pointInRects(x + dx * t, y + dy * t, ROBOT.radius)) return Math.max(0, t - 0.06);
    }
    return MAX_RANGE;
  };

  const readSectors = (s) => {
    const out = {};
    for (const sec of SECTORS) {
      let best = MAX_RANGE;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (sec.a0 + ((sec.a1 - sec.a0) * i) / (n - 1)) * (Math.PI / 180);
        best = Math.min(best, rayDistance(s.x, s.y, s.heading + a));
      }
      out[sec.key] = best;
    }
    return out;
  };

  const goalState = (s) => {
    const dx = GOAL.x - s.x;
    const dy = GOAL.y - s.y;
    return {
      goalDist: Math.hypot(dx, dy),
      goalAngle: normAngle(Math.atan2(dy, dx) - s.heading),
    };
  };

  // Rule-based expert reference policy — ground truth for labeling & evaluation
  const expertAction = (s, goalDist, goalAngle) => {
    const { front, front_left, front_right } = s.sectors;
    if (goalDist < GOAL.reach) return "STOP";
    if (front < 0.75) return front_left > front_right ? "LEFT" : "RIGHT";
    if (Math.abs(goalAngle) > 0.55 && front > 1.7) return goalAngle > 0 ? "LEFT" : "RIGHT";
    return "FORWARD";
  };

  // Deterministic class scores -> softmax probabilities (displayed as confidence)
  const classScores = (s, goalDist, goalAngle) => {
    const { front, front_left, front_right, left, right } = s.sectors;
    const align = Math.min(1, Math.abs(goalAngle) / 0.55);
    const blocked = Math.max(0, (0.75 - front) / 0.75);
    const scores = {
      FORWARD: clamp(front / 1.7, 0, 1) * 1.1 + (1 - align) * 1.0 + (front > 0.75 ? 0.15 : -0.6),
      LEFT: Math.max(0, goalAngle / 0.55) * 1.1 + blocked * (front_left - front_right + 1.2) * 0.55 + (goalDist < GOAL.reach ? -1 : 0),
      RIGHT: Math.max(0, -goalAngle / 0.55) * 1.1 + blocked * (front_right - front_left + 1.2) * 0.55 + (goalDist < GOAL.reach ? -1 : 0),
      STOP: goalDist < 1.4 ? clamp((1.4 - goalDist) / 1.4, 0, 1) * 1.6 + blocked * 0.5 : -0.6,
    };
    CLASSES.forEach((c) => (scores[c] += (Math.sin(s.cycle * 12.9898 + c.length * 78.233) * 43758.5453) % 1 * 0.04));
    const m = Math.max(...CLASSES.map((c) => scores[c]));
    const exps = CLASSES.map((c) => Math.exp((scores[c] - m) / 0.45));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = {};
    CLASSES.forEach((c, i) => (probs[c] = exps[i] / sum));
    return probs;
  };

  // Deployed-model pick: expert reference + per-model error injection (plausible confusion)
  const pickWithNoise = (expert, probs, model) => {
    if (!model || Math.random() >= model.err) return expert;
    const others = CLASSES.filter((c) => c !== expert);
    const weights = others.map((c) => probs[c] + 0.05);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < others.length; i++) {
      r -= weights[i];
      if (r <= 0) return others[i];
    }
    return others[others.length - 1];
  };

  // Shadow candidate prediction given the expert label (for A/B live comparison)
  const shadowPick = (expert, model) => {
    if (!model || Math.random() >= model.err) return expert;
    const others = CLASSES.filter((c) => c !== expert);
    return others[Math.floor(Math.random() * others.length)];
  };

  // Feature attribution for the chosen action (explainability, FR-12 extension)
  const explain = (s) => {
    const { front, front_left, front_right, left, right } = s.sectors;
    const deg = (s.goalAngle * 180) / Math.PI;
    const align = Math.min(1, Math.abs(s.goalAngle) / 0.55);
    const blocked = Math.max(0, (0.75 - front) / 0.75);
    const items = [
      {
        key: "front", label: "LiDAR Front", value: `${Sim_fmt(front)} m`,
        w: s.action === "FORWARD" ? clamp(front / 1.7, 0, 1) * 0.9 - 0.1 : -(0.35 + blocked * 0.65),
      },
      {
        key: "goal_angle", label: "Goal angle", value: `${deg >= 0 ? "+" : "−"}${Math.abs(deg).toFixed(1)}°`,
        w: s.action === "FORWARD" ? -align * 0.6 : s.action === "LEFT" ? align * 0.8 : s.action === "RIGHT" ? -align * 0.8 : align * 0.2,
      },
      {
        key: "front_left", label: "LiDAR Front-left", value: `${Sim_fmt(front_left)} m`,
        w: s.action === "LEFT" ? clamp((front_left - front_right) / 2.5, -1, 1) * 0.7 : s.action === "RIGHT" ? -clamp((front_left - front_right) / 2.5, -1, 1) * 0.7 : (front_left < 1.0 ? -0.25 : 0.1),
      },
      {
        key: "front_right", label: "LiDAR Front-right", value: `${Sim_fmt(front_right)} m`,
        w: s.action === "RIGHT" ? clamp((front_right - front_left) / 2.5, -1, 1) * 0.7 : s.action === "LEFT" ? -clamp((front_right - front_left) / 2.5, -1, 1) * 0.7 : (front_right < 1.0 ? -0.25 : 0.1),
      },
      {
        key: "side_clear", label: "Side clearance", value: `L ${Sim_fmt(left)} · R ${Sim_fmt(right)} m`,
        w: s.action === "LEFT" ? clamp(left / 3, 0, 1) * 0.3 : s.action === "RIGHT" ? clamp(right / 3, 0, 1) * 0.3 : 0.05,
      },
    ];
    const totalW = items.reduce((a, b) => a + Math.abs(b.w), 0) || 1;
    items.forEach((it) => (it.share = Math.abs(it.w) / totalW));
    const top = items.reduce((a, b) => (Math.abs(b.w) > Math.abs(a.w) ? b : a), items[0]);
    const trace = [];
    if (s.action === "STOP" && s.goalDist < GOAL.reach) {
      trace.push(`goal_dist ${Sim_fmt(s.goalDist)} m < ${GOAL.reach} m — destination reached, halt`);
    } else if (front < 0.75) {
      trace.push(`front ${Sim_fmt(front)} m < 0.75 m avoid threshold — obstacle ahead`);
      trace.push(`front_left ${Sim_fmt(front_left)} m ${front_left > front_right ? ">" : "<"} front_right ${Sim_fmt(front_right)} m — steer ${front_left > front_right ? "LEFT" : "RIGHT"}`);
    } else if (Math.abs(s.goalAngle) > 0.55 && front > 1.7) {
      trace.push(`goal_angle ${Math.abs(deg).toFixed(1)}° > 31.5° realign window — correct heading ${s.goalAngle > 0 ? "LEFT" : "RIGHT"}`);
    } else {
      trace.push(`front ${Sim_fmt(front)} m clear (> 1.7 m) · goal_angle ${Math.abs(deg).toFixed(1)}° aligned (< 31.5°) — proceed`);
    }
    return { items, top, trace };
  };

  const setGoal = (x, y) => {
    if (!isFinite(x) || !isFinite(y)) return { ok: false, msg: "Invalid coordinates." };
    x = clamp(x, 0.5, WORLD.w - 0.5);
    y = clamp(y, 0.5, WORLD.h - 0.5);
    if (pointInRects(x, y, ROBOT.radius + 0.4)) {
      return { ok: false, msg: `(${fmt(x, 1)}, ${fmt(y, 1)}) is inside an obstacle.` };
    }
    GOAL.x = x;
    GOAL.y = y;
    return { ok: true, msg: `Destination set to (${fmt(x, 1)}, ${fmt(y, 1)}).` };
  };

  const makeInitialState = () => {
    const s = {
      t: 0,
      cycle: 0,
      x: START.x,
      y: START.y,
      heading: Math.atan2(GOAL.y - START.y, GOAL.x - START.x),
      v: 0,
      w: 0,
      traveled: 0,
      action: "STOP",
      status: "standby",
      endReason: null,
      stuck: 0,
      trail: [{ x: START.x, y: START.y }],
      initialDist: Math.hypot(GOAL.x - START.x, GOAL.y - START.y),
    };
    const g = goalState(s);
    s.goalDist = g.goalDist;
    s.goalAngle = g.goalAngle;
    s.sectors = readSectors(s);
    return s;
  };

  const step = (s, model) => {
    if (s.status !== "running") return { state: s, event: null, pred: null };
    const n = {
      ...s,
      t: s.t + DT,
      cycle: s.cycle + 1,
      trail: s.trail,
    };
    const g = goalState(n);
    n.goalDist = g.goalDist;
    n.goalAngle = g.goalAngle;
    n.sectors = readSectors(n);
    const expert = expertAction(n, n.goalDist, n.goalAngle);
    const probs = classScores(n, n.goalDist, n.goalAngle);
    n.action = pickWithNoise(expert, probs, model);
    const contrib = explain(n);
    const pred = {
      action: n.action,
      expert,
      probs,
      match: n.action === expert,
      confidence: probs[n.action],
      contrib,
    };

    let event = null;
    if (n.goalDist < GOAL.reach) {
      n.status = "reached";
      n.endReason = "reached";
      n.action = "STOP";
      n.v = 0;
      n.w = 0;
      event = { ...logEvent("Destination reached. Final status available.", "good"), t: n.t };
    } else if (n.t >= TIMEOUT) {
      n.status = "terminated";
      n.endReason = "timeout";
      n.action = "STOP";
      n.v = 0;
      n.w = 0;
      event = { ...logEvent("Navigation timeout (360 s). Experiment terminated.", "bad"), t: n.t };
    } else {
      let vT = 0;
      let wT = 0;
      const front = n.sectors.front;
      if (n.action === "FORWARD") {
        vT = front < 1.7 ? 0.2 : ROBOT.vMax;
        wT = clamp(n.goalAngle * 1.1, -0.9, 0.9);
        if (front < 1.7) wT += n.sectors.front_left < n.sectors.front_right ? -0.35 : 0.35;
      } else if (n.action === "LEFT") {
        vT = 0.12;
        wT = ROBOT.wMax;
      } else if (n.action === "RIGHT") {
        vT = 0.12;
        wT = -ROBOT.wMax;
      }
      if (front < 0.75) {
        n.stuck += 1;
        if (n.stuck > 40) wT = n.goalAngle > 0 ? ROBOT.wMax : -ROBOT.wMax;
      } else {
        n.stuck = 0;
      }
      n.v += (vT - n.v) * 0.3;
      n.w += (wT - n.w) * 0.35;
      n.heading = normAngle(n.heading + n.w * DT);
      n.x += n.v * Math.cos(n.heading) * DT;
      n.y += n.v * Math.sin(n.heading) * DT;
      n.traveled += Math.abs(n.v) * DT;
      if (pointInRects(n.x, n.y, ROBOT.radius)) {
        n.status = "terminated";
        n.endReason = "collision";
        n.action = "STOP";
        n.v = 0;
        n.w = 0;
        event = { ...logEvent("Collision with obstacle. Experiment terminated.", "bad"), t: n.t };
      }
    }

    const last = n.trail[n.trail.length - 1];
    if (Math.hypot(n.x - last.x, n.y - last.y) > 0.12) {
      n.trail = [...n.trail, { x: n.x, y: n.y }].slice(-600);
    }
    return { state: n, event, pred };
  };

  const logEvent = (text, tone) => ({ kind: "event", text, tone: tone || "info" });
  const cycleEntry = (s, pred) => ({
    kind: "cycle",
    cycle: s.cycle,
    t: s.t,
    action: s.action,
    front: s.sectors.front,
    goalDist: s.goalDist,
    ...pred,
  });

  // ---- CSV export (FR-06 · FR-15) ----
  const CSV_COLS = [
    { key: "cycle", label: "cycle", on: true },
    { key: "t", label: "t_s", on: true },
    { key: "action", label: "model_action", on: true },
    { key: "expert", label: "expert_action", on: true },
    { key: "confidence", label: "confidence", on: true },
    { key: "front", label: "lidar_front_m", on: true },
    { key: "front_left", label: "lidar_front_left_m", on: true },
    { key: "left", label: "lidar_left_m", on: true },
    { key: "front_right", label: "lidar_front_right_m", on: true },
    { key: "right", label: "lidar_right_m", on: true },
    { key: "goal_dist", label: "goal_dist_m", on: true },
    { key: "goal_angle", label: "goal_angle_rad", on: true },
    { key: "v", label: "v_m_s", on: false },
    { key: "w", label: "w_rad_s", on: false },
  ];

  const buildCSV = (entries, cols) => {
    const active = cols.filter((c) => c.on);
    const cell = (e, k) => {
      if (e[k] == null) return "";
      if (typeof e[k] === "number") return e[k].toFixed(k === "t" ? 1 : 4).replace(/\.?0+$/, "") || "0";
      return String(e[k]);
    };
    const lines = [active.map((c) => c.label).join(",")];
    for (const e of entries) {
      if (e.kind !== "cycle") continue;
      lines.push(active.map((c) => cell(e, c.key)).join(","));
    }
    return lines.join("\n");
  };

  const fmt = (v, d = 2) => v.toFixed(d);
  const Sim_fmt = fmt;
  const fmtClock = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const fmtLogTime = (t) => {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
  };

  return {
    DT, MAX_RANGE, WORLD, GOAL, START, ROBOT, OBSTACLES, SECTORS, CLASSES,
    MODELS, NAV_HISTORY, CSV_COLS,
    makeInitialState, step, logEvent, cycleEntry, setGoal, goalState, readSectors,
    expertAction, classScores, shadowPick, explain, buildCSV,
    fmt, fmtClock, fmtLogTime,
  };
})();

Object.assign(window, { Sim });
