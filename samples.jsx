function frozenState(pos, extra) {
  const s = { ...Sim.makeInitialState(), x: pos.x, y: pos.y, heading: pos.heading };
  s.sectors = Sim.readSectors(s);
  const g = Sim.goalState(s);
  s.goalDist = g.goalDist;
  s.goalAngle = g.goalAngle;
  return { ...s, ...extra };
}

function buildTrail(from, to, n, bend) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * bend;
    pts.push({ x, y });
  }
  return pts;
}

const RUNNING = frozenState(
  { x: 7.3, y: 9.7, heading: Math.atan2(2 - 9.7, 18 - 7.3) },
  {
    status: "running",
    action: "FORWARD",
    cycle: 213,
    t: 42.6,
    v: 0.41,
    w: -0.12,
    traveled: 8.31,
    trail: buildTrail({ x: 2, y: 12 }, { x: 7.3, y: 9.7 }, 26, 0.9),
  }
);

const STANDBY = Sim.makeInitialState();

const REACHED = frozenState(
  { x: 17.55, y: 2.1, heading: 0.15 },
  {
    status: "reached",
    endReason: "reached",
    action: "STOP",
    v: 0,
    w: 0,
    cycle: 441,
    t: 88.2,
    traveled: 23.4,
    trail: buildTrail({ x: 2, y: 12 }, { x: 17.55, y: 2.1 }, 40, -2.2),
  }
);

const COLLISION = frozenState(
  { x: 5.95, y: 6.3, heading: -1.45 },
  {
    status: "terminated",
    endReason: "collision",
    action: "STOP",
    v: 0,
    w: 0,
    cycle: 287,
    t: 57.4,
    traveled: 12.6,
    trail: buildTrail({ x: 2, y: 12 }, { x: 5.95, y: 6.3 }, 22, -0.4),
  }
);

const SAMPLE_LOG = [
  { ...Sim.logEvent("Experiment started. Live monitoring at 5 Hz.", "info"), t: 0 },
  { kind: "cycle", cycle: 1, t: 0.2, action: "FORWARD", front: 3.98, goalDist: 18.86 },
  { kind: "cycle", cycle: 2, t: 0.4, action: "FORWARD", front: 3.96, goalDist: 18.78 },
  { kind: "cycle", cycle: 3, t: 0.6, action: "FORWARD", front: 3.91, goalDist: 18.66 },
  { ...Sim.logEvent("Destination set to (18.0, 2.0) via console.", "warn"), t: 11.2 },
  { kind: "cycle", cycle: 57, t: 11.4, action: "LEFT", front: 1.18, goalDist: 15.9 },
  { kind: "cycle", cycle: 58, t: 11.6, action: "LEFT", front: 1.22, goalDist: 15.84 },
  { kind: "cycle", cycle: 59, t: 11.8, action: "FORWARD", front: 1.74, goalDist: 15.71 },
  { kind: "cycle", cycle: 60, t: 12.0, action: "FORWARD", front: 2.03, goalDist: 15.55 },
  { ...Sim.logEvent("Monitoring paused by operator.", "warn"), t: 12.4 },
  { kind: "cycle", cycle: 61, t: 12.6, action: "FORWARD", front: 2.31, goalDist: 15.38 },
  { kind: "cycle", cycle: 62, t: 12.8, action: "RIGHT", front: 1.62, goalDist: 15.21 },
];

const SAMPLE_TERM = [
  { kind: "info", text: "Operator console ready. Type help for commands.", t: 0 },
  { kind: "input", text: "start", t: 0.2 },
  { kind: "ok", text: "Experiment started.", t: 0.2 },
  { kind: "input", text: "goal 18 2", t: 11.2 },
  { kind: "ok", text: "Destination set to (18.0, 2.0).", t: 11.2 },
  { kind: "input", text: "speed 16", t: 12 },
  { kind: "ok", text: "speed = 16x", t: 12 },
  { kind: "input", text: "status", t: 13.1 },
  { kind: "ok", text: "status=RUNNING cycle=#0066 t=00:13 action=FORWARD goal=15.38m speed=16x", t: 13.1 },
];

// ---- DS Workspace sample state (review v2) ----
const SAMPLE_DS = {
  cycles: 213,
  matches: 203,
  mismatches: 10,
  confusion: [
    [128, 5, 2, 1],
    [1, 12, 0, 0],
    [0, 1, 55, 0],
    [0, 0, 0, 8],
  ],
  accHist: Array.from({ length: 45 }, (_, i) => 87.5 + i * 0.18 + Math.sin(i * 0.9) * 2.4),
  mismList: [
    { cycle: 57, action: "LEFT", expert: "FORWARD", front: 0.68, angle: 12 },
    { cycle: 88, action: "RIGHT", expert: "FORWARD", front: 0.71, angle: -9 },
    { cycle: 121, action: "FORWARD", expert: "LEFT", front: 1.92, angle: 34 },
    { cycle: 158, action: "STOP", expert: "FORWARD", front: 2.4, angle: 3 },
  ],
  shadowCycles: 213,
  shadowMatches: 189,
};

function FrozenDashboard({ state, log, termLines, running }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <h1>NAVIGATION MONITOR</h1>
          <span className="title-meta">
            deployed model <strong>random_forest_v1.4.pkl</strong> · gazebo/ros2 sim · cycle 5 Hz
          </span>
        </div>
        <div className="view-tabs" role="tablist">
          <button className="active">Operator View</button>
          <button>DS Workspace</button>
        </div>
        <div className="topbar-spacer"></div>
        <div className="top-right">
          <StatusBadge status={state.status} running={running} />
          <div className="clock-chip">
            <span className="micro">Elapsed</span>
            <span className="clock">{Sim.fmtClock(state.t)}</span>
          </div>
          <div className="controls">
            <div className="btn-group">
              <button className="btn">1×</button>
              <button className="btn active">4×</button>
              <button className="btn">16×</button>
            </div>
            <button className="btn"><IconPause />Pause</button>
            <button className="btn danger"><IconTerminate />Terminate</button>
            <button className="btn"><IconRestart />Restart</button>
          </div>
        </div>
      </header>
      <EndBar state={state} />
      <main className="main">
        <div className="col">
          <ActionHero state={state} />
          <Panel title="Robot Telemetry" label="Robot telemetry">
            <TelemetryGrid state={state} />
          </Panel>
        </div>
        <div className="col">
          <MapPanel state={state} />
          <GoalPanel state={state} />
        </div>
        <div className="col">
          <RadarPanel state={state} />
          <CycleLog entries={log} />
          <Terminal lines={termLines} onCommand={() => {}} />
        </div>
      </main>
    </div>
  );
}

Object.assign(window, {
  frozenState, buildTrail,
  RUNNING, STANDBY, REACHED, COLLISION,
  SAMPLE_LOG, SAMPLE_TERM, SAMPLE_DS, FrozenDashboard,
});
