const params = new URLSearchParams(window.location.search);
const c = params.get("c") || "full";

function fitBody(h) {
  return { style: { height: h } };
}

function ShotStates() {
  return (
    <div className="shot shot-plain shot-row">
      <StatusBadge status="standby" running={false} />
      <StatusBadge status="running" running={true} />
      <StatusBadge status="running" running={false} />
      <StatusBadge status="reached" running={false} />
      <StatusBadge status="terminated" running={false} />
      <div className="endbar reached" style={{ alignSelf: "stretch" }}>
        <span>DESTINATION REACHED</span>
        <span className="end-meta">elapsed 01:28 · traveled 23.4 m · 441 cycles</span>
      </div>
      <div className="endbar terminated" style={{ alignSelf: "stretch" }}>
        <span>COLLISION — EXPERIMENT TERMINATED</span>
        <span className="end-meta">elapsed 00:57 · traveled 12.6 m · 287 cycles</span>
      </div>
    </div>
  );
}

function ShotControls() {
  return (
    <div className="shot shot-plain shot-row">
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <StatusBadge status="running" running={true} />
        <div className="clock-chip">
          <span className="micro">Elapsed</span>
          <span className="clock">{Sim.fmtClock(RUNNING.t)}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <div className="btn-group">
          <button className="btn">1×</button>
          <button className="btn active">4×</button>
          <button className="btn">16×</button>
        </div>
        <button className="btn"><IconPlay />Start</button>
        <button className="btn"><IconPause />Pause</button>
        <button className="btn danger"><IconTerminate />Terminate</button>
        <button className="btn"><IconRestart />Restart</button>
      </div>
    </div>
  );
}

const SHOTS = {
  full: () => (
    <div className="shot shot-full">
      <FrozenDashboard state={RUNNING} log={SAMPLE_LOG} termLines={SAMPLE_TERM} running={true} />
    </div>
  ),
  action: () => (
    <div className="shot w-340 h-fit" style={{ height: 230 }}>
      <ActionHero state={RUNNING} />
    </div>
  ),
  telemetry: () => (
    <div className="shot w-340" style={{ height: 172 }}>
      <Panel title="Robot Telemetry" label="Robot telemetry">
        <TelemetryGrid state={RUNNING} />
      </Panel>
    </div>
  ),
  goal: () => (
    <div className="shot w-340" style={{ height: 190 }}>
      <GoalPanel state={RUNNING} />
    </div>
  ),
  states: () => <ShotStates />,
  controls: () => <ShotControls />,
  map: () => (
    <div className="shot w-860" style={{ height: 600 }}>
      <MapPanel state={RUNNING} />
    </div>
  ),
  radar: () => (
    <div className="shot w-420" style={{ height: 560 }}>
      <RadarPanel state={RUNNING} />
    </div>
  ),
  log: () => (
    <div className="shot w-460" style={{ height: 300 }}>
      <CycleLog entries={SAMPLE_LOG} />
    </div>
  ),
  console: () => (
    <div className="shot w-480" style={{ height: 300 }}>
      <Terminal lines={SAMPLE_TERM} onCommand={() => {}} />
    </div>
  ),
};

document.title = "shot-" + c;
ReactDOM.createRoot(document.getElementById("root")).render((SHOTS[c] || SHOTS.full)());
