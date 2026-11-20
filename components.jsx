const ACTION_META = {
  FORWARD: { color: "var(--green)", Icon: IconForward },
  LEFT: { color: "var(--cyan)", Icon: IconLeft },
  RIGHT: { color: "var(--cyan)", Icon: IconRight },
  STOP: { color: "var(--red)", Icon: IconStop },
};

const REASON_LABEL = {
  reached: "DESTINATION REACHED",
  operator: "TERMINATED BY OPERATOR",
  collision: "COLLISION — EXPERIMENT TERMINATED",
  timeout: "NAVIGATION TIMEOUT — EXPERIMENT TERMINATED",
};

const lidarColor = (d) => {
  if (d < 0.6) return "var(--red)";
  if (d < 1.4) return "var(--amber)";
  return "var(--cyan)";
};

function Panel({ title, note, className, label, children, bodyClassName }) {
  return (
    <section className={`panel ${className || ""}`} data-screen-label={label || title}>
      <div className="panel-head">
        <span className="micro">{title}</span>
        {note ? <span className="micro" style={{ letterSpacing: "0.04em" }}>{note}</span> : null}
      </div>
      <div className={`panel-body ${bodyClassName || ""}`}>{children}</div>
    </section>
  );
}

function StatusBadge({ status, running }) {
  let cls = "standby";
  let label = "STANDBY";
  if (status === "running") {
    cls = "running";
    label = running ? "RUNNING" : "PAUSED";
  } else if (status === "reached") {
    cls = "reached";
    label = "DESTINATION REACHED";
  } else if (status === "terminated") {
    cls = "terminated";
    label = "TERMINATED";
  }
  return (
    <span className={`badge ${cls}`}>
      <span className={`dot ${cls === "running" && running ? "dot-pulse" : ""}`}></span>
      {label}
    </span>
  );
}

function ActionHero({ state }) {
  const meta = ACTION_META[state.action];
  const Icon = meta.Icon;
  const probs = state.probs || Sim.classScores(state, state.goalDist, state.goalAngle);
  const conf = probs[state.action] != null ? probs[state.action] : 0;
  return (
    <Panel title="Predicted Action" note="ML CLASSIFIER" label="Predicted action" className="action-hero">
      <div className="action-line" style={{ color: meta.color }}>
        <Icon />
        <span className="action-word">{state.action}</span>
        <span className="conf-block">
          <span className="micro">Confidence</span>
          <span className="conf-val">{(conf * 100).toFixed(0)}%</span>
        </span>
      </div>
      <div className="class-chips">
        {Object.keys(ACTION_META).map((c) => (
          <span key={c} className={`chip ${c === state.action ? "active" : ""}`} style={c === state.action ? { background: ACTION_META[c].color } : null}>
            {c}
          </span>
        ))}
      </div>
      <div className="conf-bar">
        <span style={{ width: `${conf * 100}%`, background: meta.color }}></span>
      </div>
      <div className="action-sub">
        cycle #{String(state.cycle).padStart(4, "0")} · t {Sim.fmtClock(state.t)} · 5 Hz
      </div>
    </Panel>
  );
}

function TelemetryGrid({ state }) {
  const deg = (state.goalAngle * 180) / Math.PI;
  const cells = [
    { label: "Linear velocity", val: Sim.fmt(state.v), unit: "m/s" },
    { label: "Angular velocity", val: `${state.w >= 0 ? "+" : ""}${Sim.fmt(state.w)}`, unit: "rad/s" },
    { label: "Goal angle", val: `${deg >= 0 ? "" : "−"}${Math.abs(deg).toFixed(1)}° ${deg >= 0 ? "L" : "R"}`, unit: "" },
    { label: "Traveled", val: Sim.fmt(state.traveled), unit: "m" },
  ];
  return (
    <div className="tele-grid">
      {cells.map((c) => (
        <div className="tele-cell" key={c.label}>
          <span className="micro">{c.label}</span>
          <span className="val">
            {c.val}
            {c.unit ? <span className="unit">{c.unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function GoalPanel({ state }) {
  const pct = Math.max(0, Math.min(100, (1 - state.goalDist / state.initialDist) * 100));
  return (
    <Panel title="Distance to Goal" label="Distance to goal" className="goal-panel">
      <div className="goal-row">
        <span className="goal-val">{Sim.fmt(state.goalDist)}</span>
        <span className="goal-unit">m to destination</span>
      </div>
      <div className="goal-bar">
        <div style={{ width: `${pct}%` }}></div>
      </div>
      <div className="goal-meta">
        GOAL ({Sim.fmt(Sim.GOAL.x, 1)}, {Sim.fmt(Sim.GOAL.y, 1)}) · {pct.toFixed(0)}% OF INITIAL DISTANCE
      </div>
    </Panel>
  );
}

function MapPanel({ state, world = Sim.WORLD, obstacles = Sim.OBSTACLES, start = Sim.START,
  goal = Sim.GOAL, sectors = Sim.SECTORS, title = "Warehouse — Top View", label = "Warehouse map",
  markerScale = 1, onPickGoal }) {
  const W = world.w * 10;
  const H = world.h * 10;
  const sx = state.x * 10;
  const sy = (world.h - state.y) * 10;
  const gx = goal && goal.x * 10;
  const gy = goal && (world.h - goal.y) * 10;
  const hasGoalRadius = Number.isFinite(goal?.radius);
  const goalRadius = hasGoalRadius ? goal.radius * 10 : 7;
  const gridV = [];
  for (let i = 0; i <= world.w; i++) gridV.push(i * 10);
  const gridH = [];
  for (let i = 0; i <= world.h; i++) gridH.push(i * 10);
  const pickGoal = (event) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onPickGoal(point.x / 10, (H - point.y) / 10);
  };
  return (
    <Panel title={title} label={label} note={`${world.w} × ${world.h} M`} className="map-panel grow" bodyClassName="map-body">
      <svg className={`map-svg${onPickGoal ? " live-map-picking" : ""}`} role="img" aria-label={title}
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onClick={onPickGoal ? pickGoal : undefined}>
        {gridV.map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} stroke="var(--line-soft)" strokeWidth={0.5} />
        ))}
        {gridH.map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} stroke="var(--line-soft)" strokeWidth={0.5} />
        ))}
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="var(--line)" strokeWidth={1} />
        {obstacles.map(([rx, ry, rw, rh], i) => (
          <rect key={i} x={rx * 10} y={(world.h - ry - rh) * 10} width={rw * 10} height={rh * 10} fill="var(--map-obstacle)" stroke="var(--map-obstacle-line)" strokeWidth={0.8} />
        ))}
        <polyline
          points={state.trail.map((p) => `${p.x * 10},${(world.h - p.y) * 10}`).join(" ")}
          fill="none"
          stroke="var(--map-trail)"
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {sectors.map((sec) => {
          const d = state.sectors[sec.key];
          if (!Number.isFinite(d)) return null;
          const len = Math.min(d, 2.5) * 10;
          const ang = state.heading + ((sec.a0 + sec.a1) / 2) * (Math.PI / 180);
          return (
            <line
              key={sec.key}
              x1={sx}
              y1={sy}
              x2={sx + Math.cos(ang) * len}
              y2={sy - Math.sin(ang) * len}
              stroke={lidarColor(d)}
              strokeWidth={1.2}
              strokeOpacity={0.85}
            />
          );
        })}
        {goal && <>
          <circle cx={gx} cy={gy} r={goalRadius} fill="none" stroke="var(--green)" strokeWidth={hasGoalRadius ? 0.35 : 1.2} />
          <circle cx={gx} cy={gy} r={hasGoalRadius ? Math.min(0.65, goalRadius * 0.4) : 2} fill="var(--green)" />
          <text x={gx} y={gy + (hasGoalRadius ? goalRadius + 3.3 : 16)} textAnchor="middle"
            fontSize={hasGoalRadius ? 2.6 : 6.5} fill="var(--green)" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.1em">
            GOAL
          </text>
        </>}
        {start && <text x={start.x * 10} y={(world.h - start.y) * 10 - 6} textAnchor="middle" fontSize={6} fill="var(--faint)" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.1em">
          START
        </text>}
        <g transform={`translate(${sx}, ${sy}) rotate(${-state.heading * (180 / Math.PI)})${markerScale === 1 ? "" : ` scale(${markerScale})`}`}>
          <polygon points="7,0 -5,4.5 -5,-4.5" fill="var(--map-robot)" stroke="var(--map-robot-line)" strokeWidth={0.8} />
        </g>
      </svg>
    </Panel>
  );
}

function RadarPanel({ state, sectors = Sim.SECTORS, maxRange = Sim.MAX_RANGE }) {
  const ri = 26;
  const perM = 110 / maxRange;
  const pt = (aDeg, r) => {
    const a = (aDeg * Math.PI) / 180;
    return [(-Math.sin(a) * r), (-Math.cos(a) * r)];
  };
  const rings = [1, 2, 3, 4].map((k) => {
    const meters = maxRange * k / 4;
    const r = ri + perM * meters;
    const [x1, y1] = pt(-120, r);
    const [x2, y2] = pt(120, r);
    return (
      <g key={k}>
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 1 0 ${x2} ${y2}`} fill="none" stroke="var(--line-soft)" strokeWidth={k === 4 ? 1 : 0.7} />
        <text x={5} y={-r + 3} fontSize={8} fill="var(--faint)" fontFamily="IBM Plex Mono, monospace">
          {Number(meters.toFixed(2))}m
        </text>
      </g>
    );
  });
  const wedges = sectors.map((sec) => {
    const d = state.sectors[sec.key];
    if (!Number.isFinite(d)) return null;
    const outer = ri + Math.min(d, maxRange) * perM;
    const [x1, y1] = pt(sec.a0, ri);
    const [xo1, yo1] = pt(sec.a0, outer);
    const [xo2, yo2] = pt(sec.a1, outer);
    const [x2, y2] = pt(sec.a1, ri);
    const c = lidarColor(d);
    return (
      <path
        key={sec.key}
        d={`M ${x1} ${y1} L ${xo1} ${yo1} A ${outer} ${outer} 0 0 0 ${xo2} ${yo2} L ${x2} ${y2} A ${ri} ${ri} 0 0 1 ${x1} ${y1} Z`}
        fill={c}
        fillOpacity={0.45}
        stroke={c}
        strokeOpacity={0.9}
        strokeWidth={1}
      />
    );
  });
  return (
    <Panel title="LiDAR — Directional Min Distance" note={`RANGE ${maxRange.toFixed(1)} M`} label="LiDAR radar" className="radar-panel">
      <svg className="radar-svg" viewBox="-150 -150 300 190">
        {rings}
        {wedges}
        <circle cx={0} cy={0} r={3} fill="var(--text)" />
      </svg>
      <div className="sector-rows">
        {sectors.map((sec) => {
          const d = state.sectors[sec.key];
          const valid = Number.isFinite(d);
          const c = lidarColor(d);
          return (
            <div className="sector-row" key={sec.key}>
              <span className="s-label">{sec.label}</span>
              <span className="s-bar">
                {valid && <span style={{ display: "block", height: "100%", width: `${(Math.min(d, maxRange) / maxRange) * 100}%`, background: c }}></span>}
              </span>
              <span className="s-val">{valid ? `${Sim.fmt(d)} m` : "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--cyan)" }}></i>&gt; 1.4 m</span>
        <span><i style={{ background: "var(--amber)" }}></i>0.6 – 1.4 m</span>
        <span><i style={{ background: "var(--red)" }}></i>&lt; 0.6 m</span>
      </div>
    </Panel>
  );
}

function CycleLog({ entries }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <Panel title="Navigation Cycle Log" note="LAST 250" label="Cycle log" className="log-panel grow" bodyClassName="log-body">
      <div className="log-scroll" ref={ref}>
        {entries.map((e, i) =>
          e.kind === "event" ? (
            <div className="log-row event" key={i}>
              <span>—</span>
              <span>{e.t != null ? Sim.fmtLogTime(e.t) : "--:--"}</span>
              <span className={`tone-${e.tone}`}>EVENT</span>
              <span className="l-detail">{e.text}</span>
            </div>
          ) : (
            <div className="log-row" key={i}>
              <span>#{String(e.cycle).padStart(4, "0")}</span>
              <span>{Sim.fmtLogTime(e.t)}</span>
              <span className="l-action" style={{ color: ACTION_META[e.action].color }}>{e.action}</span>
              <span className="l-detail">front {Sim.fmt(e.front)} m · goal {Sim.fmt(e.goalDist)} m</span>
            </div>
          )
        )}
      </div>
    </Panel>
  );
}

function EndBar({ state }) {
  if (state.status !== "reached" && state.status !== "terminated") return null;
  const tone = state.status === "reached" ? "reached" : "terminated";
  const label = REASON_LABEL[state.endReason] || "EXPERIMENT ENDED";
  return (
    <div className={`endbar ${tone}`}>
      <span>{label}</span>
      <span className="end-meta">
        elapsed {Sim.fmtClock(state.t)} · traveled {Sim.fmt(state.traveled, 1)} m · {state.cycle} cycles
      </span>
    </div>
  );
}

function Terminal({ lines, onCommand }) {
  const outRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [value, setValue] = React.useState("");
  const histRef = React.useRef([]);
  const histIdxRef = React.useRef(0);
  React.useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [lines]);
  const submit = (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    histRef.current.push(v);
    histIdxRef.current = histRef.current.length;
    setValue("");
    onCommand(v);
  };
  const onKey = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = histRef.current;
      if (!h.length) return;
      histIdxRef.current = Math.max(0, histIdxRef.current - 1);
      setValue(h[histIdxRef.current]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = histRef.current;
      histIdxRef.current = Math.min(h.length, histIdxRef.current + 1);
      setValue(h[histIdxRef.current] || "");
    }
  };
  return (
    <Panel title="Operator Console" note="TYPE HELP" label="Operator console" className="term-panel" bodyClassName="term-body">
      <div className="term-out" ref={outRef} onClick={() => inputRef.current && inputRef.current.focus()}>
        {lines.map((l, i) => (
          <div className={`term-line t-${l.kind}`} key={i}>
            {l.kind === "input"
              ? <span className="term-prefix">{"> "}</span>
              : <span className="term-time">{l.t != null ? `[${Sim.fmtClock(l.t)}] ` : ""}</span>}
            <span>{l.text}</span>
          </div>
        ))}
      </div>
      <form className="term-in" onSubmit={submit}>
        <span className="term-prompt">op@nav:~$</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder="type help"
          spellCheck="false"
          autoComplete="off"
        />
      </form>
    </Panel>
  );
}

// ==================== DS WORKSPACE (review v2) ====================

const REG_STATUS_LABEL = { deployed: "A · DEPLOYED", shadow: "B · SHADOW", candidate: "CANDIDATE", uploaded: "UPLOADED" };

function ModelRegistryPanel({ models, deployedId, shadowId, selectedId, onSelect, onActivate, onSetShadow, onUpload }) {
  const fileRef = React.useRef(null);
  const sel = models.find((m) => m.id === selectedId) || models.find((m) => m.id === deployedId) || models[0];
  const rowStatus = (m) => {
    if (m.id === deployedId) return "deployed";
    if (m.id === shadowId) return "shadow";
    return m.status === "uploaded" ? "uploaded" : "candidate";
  };
  return (
    <Panel title="Model Registry" note="FR-08 · FR-10 · FR-11" label="Model registry" className="registry-panel" bodyClassName="registry-body">
      <div className="reg-table">
        <div className="reg-row reg-head">
          <span></span>
          <span>Model</span>
          <span className="num">Val acc</span>
          <span className="num">F1</span>
          <span className="num">Infer</span>
        </div>
        {models.map((m) => {
          const st = rowStatus(m);
          return (
            <div key={m.id} className={`reg-row ${m.id === sel.id ? "selected" : ""}`} onClick={() => onSelect(m.id)}>
              <span className="reg-flag">
                {st === "deployed" ? <i className="flag-a">A</i> : st === "shadow" ? <i className="flag-b">B</i> : null}
              </span>
              <span className="reg-name">
                <b>{m.algo} <em className="ver">{m.version}</em></b>
                <em>{m.file}</em>
              </span>
              <span className="num">{m.val ? `${m.val.acc.toFixed(1)}%` : "—"}</span>
              <span className="num">{m.val ? m.val.f1.toFixed(1) : "—"}</span>
              <span className="num">{m.infer ? `${m.infer.toFixed(1)} ms` : "—"}</span>
            </div>
          );
        })}
      </div>
      {sel ? (
        <div className="reg-detail">
          <div className="reg-kv">
            <span className="micro">Hyperparameters</span>
            <span className="mono">{sel.params}</span>
          </div>
          <div className="reg-kv">
            <span className="micro">Trained</span>
            <span className="mono">{sel.trained} · {sel.trainTime}</span>
          </div>
          <div className="reg-kv">
            <span className="micro">Dataset</span>
            <span className="mono">{sel.dataset} · {sel.samples.toLocaleString()} samples · {sel.features} features</span>
          </div>
          <div className="reg-kv">
            <span className="micro">Precision / Recall</span>
            <span className="mono">{sel.val.precision.toFixed(1)}% / {sel.val.recall.toFixed(1)}% · {sel.size}</span>
          </div>
          <div className="reg-actions">
            <button className="btn small primary" onClick={() => onActivate(sel.id)} disabled={sel.id === deployedId}>
              <IconCpu />
              {sel.id === deployedId ? "Deployed" : "Activate & Deploy"}
            </button>
            <button className="btn small" onClick={() => onSetShadow(sel.id)} disabled={sel.id === shadowId || sel.id === deployedId}>
              <IconSwap />
              {sel.id === shadowId ? "Shadow B" : "Set as Shadow B"}
            </button>
            <button className="btn small" onClick={() => fileRef.current && fileRef.current.click()}>
              <IconUpload />
              Upload model
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pkl,.joblib,.onnx"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) onUpload(e.target.files[0].name);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function PredictionQualityPanel({ state, ds, deployed }) {
  const acc = ds.cycles > 0 ? (ds.matches / ds.cycles) * 100 : null;
  const conf = state.probs ? state.probs[state.action] : null;
  const hist = ds.accHist;
  const lo = 70, hi = 100;
  const pts = hist.length > 1
    ? hist.map((v, i) => `${(i / (hist.length - 1)) * 100},${28 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 26}`).join(" ")
    : null;
  const cells = [
    { label: "Live accuracy", val: acc == null ? "—" : `${acc.toFixed(1)}%`, tone: "good" },
    { label: "Confidence", val: conf == null ? "—" : `${(conf * 100).toFixed(1)}%`, tone: "cyan" },
    { label: "Mismatches", val: String(ds.mismatches), tone: "bad" },
    { label: "Cycles", val: String(ds.cycles), tone: "" },
  ];
  return (
    <Panel title="Prediction Quality — Live" note="FR-09 · FR-12" label="Prediction quality" className="quality-panel">
      <div className="q-stats">
        {cells.map((c) => (
          <div className={`q-cell ${c.tone ? `t-${c.tone}` : ""}`} key={c.label}>
            <span className="micro">{c.label}</span>
            <span className="q-val">{c.val}</span>
          </div>
        ))}
      </div>
      <div className="spark-block">
        <div className="spark-head">
          <span className="micro">Rolling accuracy — last 200 cycles</span>
          <span className="micro">{deployed ? `${deployed.algo} ${deployed.version}` : ""}</span>
        </div>
        <div className="spark-holder">
          <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
            <line x1="0" y1="28" x2="100" y2="28" stroke="var(--line-soft)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            {pts ? <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {!pts && ds.cycles === 0 ? <div className="spark-empty">start experiment to sample accuracy</div> : null}
        </div>
      </div>
      <div className="mism-block">
        <div className="spark-head">
          <span className="micro">Mismatch review — model vs expert reference</span>
          <span className="micro">{ds.mismatches} total</span>
        </div>
        <div className="mism-list">
          {ds.mismList.length === 0 ? (
            <div className="mism-empty">{ds.cycles === 0 ? "No mismatches recorded yet." : "No mismatches so far — model matches expert on every cycle."}</div>
          ) : (
            ds.mismList.map((m, i) => (
              <div className="mism-row" key={`${m.cycle}-${i}`}>
                <span className="mono">#{String(m.cycle).padStart(4, "0")}</span>
                <span className="m-pred">{m.action}</span>
                <span className="m-arrow">→</span>
                <span className="m-expert">{m.expert}</span>
                <span className="m-ctx">front {Sim.fmt(m.front)} m · ∠ {m.angle >= 0 ? "+" : "−"}{Math.abs(m.angle).toFixed(0)}°</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function ConfusionMatrixPanel({ ds }) {
  const cls = Sim.CLASSES;
  const short = { FORWARD: "FWD", LEFT: "LEFT", RIGHT: "RIGHT", STOP: "STOP" };
  const M = ds.confusion;
  const max = Math.max(1, ...M.flat());
  const rowSums = cls.map((_, i) => M[i].reduce((a, b) => a + b, 0));
  const colSums = cls.map((_, j) => M.reduce((a, row) => a + row[j], 0));
  const correct = M.reduce((a, row, i) => a + row[i], 0);
  const total = rowSums.reduce((a, b) => a + b, 0);
  return (
    <Panel title="Confusion Matrix — Model vs Expert" note="FR-09" label="Confusion matrix" className="matrix-panel grow" bodyClassName="matrix-body">
      {total === 0 ? (
        <div className="matrix-empty">Run the experiment — every 5 Hz cycle compares the model action with the expert reference policy and fills this matrix.</div>
      ) : (
        <div className="matrix-wrap">
          <div className="matrix-grid" style={{ gridTemplateColumns: `58px repeat(${cls.length}, 1fr)` }}>
            <div className="mx-corner micro">expert ↓ · model →</div>
            {cls.map((c) => (
              <div className="mx-head micro" key={c}>{short[c]}</div>
            ))}
            {cls.map((c, i) => (
              <React.Fragment key={c}>
                <div className="mx-rowhead micro">{short[c]}</div>
                {cls.map((p, j) => {
                  const v = M[i][j];
                  const diag = i === j;
                  const bg = v === 0 ? "transparent" : diag ? `rgba(63, 214, 143, ${0.12 + (v / max) * 0.5})` : `rgba(255, 92, 92, ${0.1 + (v / max) * 0.45})`;
                  return (
                    <div className={`mx-cell ${diag ? "diag" : ""} ${v === 0 ? "zero" : ""}`} style={{ background: bg }} key={p}>
                      {v}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            <div className="mx-corner micro">recall</div>
            {cls.map((c, j) => (
              <div className="mx-tot micro" key={c}>{rowSums[j] ? `${((M[j][j] / rowSums[j]) * 100).toFixed(0)}%` : "—"}</div>
            ))}
          </div>
          <div className="mx-foot mono">
            agreement {total ? ((correct / total) * 100).toFixed(1) : "0.0"}% · {total} cycles scored
          </div>
        </div>
      )}
    </Panel>
  );
}

function DecisionExplainerPanel({ state }) {
  const ex = state.contrib || Sim.explain(state);
  const meta = ACTION_META[state.action] || ACTION_META.FORWARD;
  return (
    <Panel title="Decision Explainer" note="FR-12 · EXPLAINABILITY" label="Decision explainer" className="expl-panel">
      <div className="expl-sum">
        <span className="expl-verb" style={{ color: meta.color }}>{state.action}</span>
        <span className="expl-because">
          driven by <b>{ex.top.label}</b> ({ex.top.value}) — {(ex.top.share * 100).toFixed(0)}% of decision weight
        </span>
      </div>
      <div className="contrib-rows">
        {ex.items.map((it) => {
          const pct = it.share * 100;
          const pos = it.w >= 0;
          return (
            <div className="contrib-row" key={it.key}>
              <span className="c-label">{it.label}</span>
              <span className="c-bar">
                <span className="c-axis"></span>
                <span
                  className={`c-fill ${pos ? "pos" : "neg"} ${it === ex.top ? "top" : ""}`}
                  style={pos ? { left: "50%", width: `${(pct / 2) * 0.96}%` } : { right: "50%", width: `${(pct / 2) * 0.96}%` }}
                ></span>
              </span>
              <span className="c-share mono">{pct.toFixed(0)}%</span>
              <span className="c-val mono">{it.value}</span>
            </div>
          );
        })}
      </div>
      <div className="expl-legend">
        <span><i style={{ background: "var(--green)" }}></i>supports decision</span>
        <span><i style={{ background: "var(--red)" }}></i>pushes against</span>
      </div>
      <div className="expl-trace mono">
        {ex.trace.map((line, i) => (
          <div key={i}>▸ {line}</div>
        ))}
      </div>
    </Panel>
  );
}

function ABComparePanel({ models, deployedId, shadowId, ds }) {
  const A = models.find((m) => m.id === deployedId);
  const B = models.find((m) => m.id === shadowId);
  const aAcc = ds.cycles > 0 ? (ds.matches / ds.cycles) * 100 : null;
  const bAcc = ds.shadowCycles > 0 ? (ds.shadowMatches / ds.shadowCycles) * 100 : null;
  return (
    <Panel title="A/B Model Comparison" note="FR-16" label="A/B comparison" className="ab-panel" bodyClassName="ab-body">
      <div className="ab-cards">
        <div className={`ab-card ${aAcc != null && bAcc != null && aAcc >= bAcc ? "win" : ""}`}>
          <div className="ab-head">
            <i className="flag-a">A</i>
            <span className="ab-name">{A ? `${A.algo} ${A.version}` : "—"}</span>
            <span className="micro">deployed</span>
          </div>
          <div className="ab-acc">{aAcc == null ? "—" : `${aAcc.toFixed(1)}%`}</div>
          <div className="ab-sub mono">{A ? `val ${(A.val.acc).toFixed(1)}% · ${A.infer.toFixed(1)} ms · this session ${ds.cycles} cycles` : ""}</div>
        </div>
        <div className={`ab-card ${bAcc != null && aAcc != null && bAcc > aAcc ? "win" : ""}`}>
          {B ? (
            <React.Fragment>
              <div className="ab-head">
                <i className="flag-b">B</i>
                <span className="ab-name">{B.algo} {B.version}</span>
                <span className="micro">shadow</span>
              </div>
              <div className="ab-acc">{bAcc == null ? "—" : `${bAcc.toFixed(1)}%`}</div>
              <div className="ab-sub mono">val {(B.val.acc).toFixed(1)}% · {B.infer.toFixed(1)} ms · shadow scored on same expert labels</div>
            </React.Fragment>
          ) : (
            <div className="ab-empty">Select a <b>Shadow B</b> candidate in Model Registry to score it live against A on the same cycles.</div>
          )}
        </div>
      </div>
      <div className="nav-hist">
        <div className="spark-head">
          <span className="micro">Navigation-level history</span>
          <span className="micro">previous sessions · FR-16</span>
        </div>
        <div className="nh-table">
          <div className="nh-row nh-head">
            <span>Model</span>
            <span className="num">Runs</span>
            <span className="num">Success</span>
            <span className="num">Collision</span>
            <span className="num">Avg time</span>
            <span className="num">Avg dist</span>
          </div>
          {models.map((m) => {
            const h = Sim.NAV_HISTORY[m.id] || { runs: 0, success: 0, collision: 0, avgTime: 0, avgDist: 0 };
            return (
              <div className={`nh-row ${m.id === deployedId ? "current" : ""}`} key={m.id}>
                <span className="nh-name">{m.algo} {m.version}</span>
                <span className="num">{h.runs}</span>
                <span className="num good">{h.success}%</span>
                <span className={`num ${h.collision > 20 ? "bad" : ""}`}>{h.collision}%</span>
                <span className="num">{h.avgTime} s</span>
                <span className="num">{h.avgDist} m</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function DatasetExportPanel({ cycles, mismatches, cols, onToggleCol, onExport, runId }) {
  const activeCols = cols.filter((c) => c.on).length;
  const estKB = ((cycles * activeCols * 7.5) / 1024).toFixed(1);
  return (
    <Panel title="Dataset & Export" note="FR-06 · UC-02" label="Dataset export" className="export-panel" bodyClassName="export-body">
      <div className="exp-meta mono">
        <span className="exp-run">{runId}</span>
        <span>{cycles} cycles</span>
        <span className={mismatches > 0 ? "bad" : ""}>{mismatches} model≠expert</span>
        <span>~{estKB} KB</span>
      </div>
      <div className="col-chips">
        {cols.map((c) => (
          <button key={c.key} className={`chip-btn ${c.on ? "on" : ""}`} onClick={() => onToggleCol(c.key)} title={c.on ? "included in export" : "excluded from export"}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="exp-actions">
        <button className="btn primary" onClick={onExport} disabled={cycles === 0}>
          <IconDownload />
          Export CSV
        </button>
        <span className="exp-note">Labels carry model action + expert reference for relabeling before retraining.</span>
      </div>
    </Panel>
  );
}

Object.assign(window, {
  ACTION_META, REASON_LABEL, lidarColor,
  Panel, StatusBadge, ActionHero, TelemetryGrid, GoalPanel, MapPanel, RadarPanel, CycleLog, EndBar, Terminal,
  ModelRegistryPanel, PredictionQualityPanel, ConfusionMatrixPanel, DecisionExplainerPanel, ABComparePanel, DatasetExportPanel, REG_STATUS_LABEL,
});
