const TOTAL = 9;

function Sheet({ n, total, title, className = "", children }) {
  const isCover = className.includes("cover");
  return (
    <div className={`sheet ${className}`}>
      {!isCover && (
        <div className="sheet-head">
          <div className="sh-left">
            <span className="micro" style={{ color: "var(--amber)", marginRight: "8px" }}>0{n} / 0{total}</span>
            <span style={{ fontWeight: 600, fontSize: "14px" }}>{title}</span>
          </div>
          <div className="sh-right micro">Intelligent Systems · HCMUT · Nav Monitor Mockup</div>
        </div>
      )}
      {children}
      <div className="sheet-foot">
        <span>Machine Learning-Based Mobile Robot Navigation in Gazebo</span>
        <span>Page 0{n} / 0{total}</span>
      </div>
    </div>
  );
}

function Figure({ name, tag, desc, bodyStyle = {}, children }) {
  return (
    <div className="figure">
      <div className="fig-cap">
        <div className="fc-name">
          {name}
          {tag && <span className="fc-tag">{tag}</span>}
        </div>
        {desc && <div className="fc-desc">{desc}</div>}
      </div>
      <div className="fig-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

const DF_ROWS = [
  ["Action Hero (Dual Mode)", "Movement class: manual keyboard control during data collection (W/A/S/D) or deployed ML prediction — v2: adds prediction confidence %", "FR-04 · FR-05 · FR-12 · FR-17"],
  ["Robot Telemetry", "Linear velocity v (m/s), angular velocity w (rad/s), goal angle deviation (°), traveled distance", "FR-02 · FR-15"],
  ["Distance to Goal", "Euclidean distance to target destination (m) and journey completion progress (%)", "FR-17"],
  ["Warehouse Map", "Robot 2D pose (x, y, heading), destination marker, obstacle layout, and traveled trajectory", "FR-01 · FR-02"],
  ["LiDAR Radar", "5 directional minimum distances: Front, Front-Left, Left, Front-Right, Right (thresholds: 0.6m / 1.4m)", "FR-03"],
  ["Navigation Cycle Log", "5 Hz streaming cycle log (cycle ID, timestamp, predicted action, sensor distances) & events", "FR-14 · FR-15 · FR-17"],
  ["Operator Console", "Interactive CLI commands: start, pause, resume, terminate, restart, speed, goal <x> <y>, model use <id>", "UC-07 · UC-09"],
];

function App() {
  return (
    <div>
      <Sheet n={1} total={TOTAL} title="Mockup Design Spec" className="cover">
        <div className="cover-kicker micro">UI Mockup · Experiment Monitoring Interface · Intelligent Systems (HCMUT)</div>
        <h1>NAVIGATION<br />MONITOR</h1>
        <div className="cover-meta">
          <div className="cm-item">
            <span className="micro">Course</span>
            <span className="cm-val">Intelligent Systems</span>
          </div>
          <div className="cm-item">
            <span className="micro">Supervisor</span>
            <span className="cm-val">Assoc. Prof. Dr. Quan Thanh Tho</span>
          </div>
          <div className="cm-item">
            <span className="micro">Group Members</span>
            <span className="cm-val">Pham Xuan Hien · Nguyen Thanh Dat · Nguyen Huy Hoang</span>
          </div>
        </div>
        <div className="toc">
          <div className="toc-row"><span className="toc-num">02</span><span>System Dashboard Layout Overview</span><span className="toc-page">overview</span></div>
          <div className="toc-row"><span className="toc-num">03</span><span>Experiment Lifecycle States (FR-17)</span><span className="toc-page">states</span></div>
          <div className="toc-row"><span className="toc-num">04</span><span>Detailed Components I — Action, Telemetry, Goal, Controls</span><span className="toc-page">components I</span></div>
          <div className="toc-row"><span className="toc-num">05</span><span>Detailed Components II — Warehouse Map &amp; Directional LiDAR Radar</span><span className="toc-page">components II</span></div>
          <div className="toc-row"><span className="toc-num">06</span><span>Operator Console, Cycle Log &amp; Data Traceability Matrix</span><span className="toc-page">console &amp; data flow</span></div>
          <div className="toc-row"><span className="toc-num">07</span><span>DS Workspace — Model Registry &amp; A/B Comparison</span><span className="toc-page">ds workspace I</span></div>
          <div className="toc-row"><span className="toc-num">08</span><span>DS Workspace — Prediction Quality &amp; Confusion Matrix</span><span className="toc-page">ds workspace II</span></div>
          <div className="toc-row"><span className="toc-num">09</span><span>DS Workspace — Decision Explainer &amp; Dataset Export</span><span className="toc-page">ds workspace III</span></div>
        </div>
      </Sheet>

      <Sheet n={2} total={TOTAL} title="02 · System Dashboard Layout Overview">
        <div className="dash-frame" style={{ position: "relative", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%", lineHeight: 0 }}>
            <img
              src="screens/full.png"
              alt="Navigation Monitor Dashboard Overview"
              style={{ display: "block", maxWidth: "100%", maxHeight: "152mm", width: "auto", height: "auto" }}
            />
            <div className="dash-pin" style={{ top: "8.8%", left: "1.4%" }}>1</div>
            <div className="dash-pin" style={{ top: "31.2%", left: "1.4%" }}>2</div>
            <div className="dash-pin" style={{ top: "8.8%", left: "23.6%" }}>3</div>
            <div className="dash-pin" style={{ top: "83.2%", left: "23.6%" }}>4</div>
            <div className="dash-pin" style={{ top: "8.8%", left: "77.9%" }}>5</div>
            <div className="dash-pin" style={{ top: "53.8%", left: "77.9%" }}>6</div>
            <div className="dash-pin" style={{ top: "74.9%", left: "77.9%" }}>7</div>
          </div>
        </div>
        <div className="overview-legend">
          <span className="ov-chip"><b>1</b> Predicted Action</span>
          <span className="ov-chip"><b>2</b> Robot Telemetry</span>
          <span className="ov-chip"><b>3</b> Warehouse Map</span>
          <span className="ov-chip"><b>4</b> Distance to Goal</span>
          <span className="ov-chip"><b>5</b> LiDAR Radar</span>
          <span className="ov-chip"><b>6</b> Cycle Log</span>
          <span className="ov-chip"><b>7</b> Operator Console</span>
          <span className="ov-chip"><b>+</b> DS Workspace tab — pages 07–09</span>
        </div>
      </Sheet>

      <Sheet n={3} total={TOTAL} title="03 · Experiment Lifecycle States (FR-17)">
        <div className="state-rows">
          <div className="state-row">
            <StatusBadge status="standby" running={false} />
            <span className="state-desc"><b>STANDBY</b> — Simulation loaded and idle; destination confirmed. Operator initiates experiment via Start button or <b>start</b> CLI command.</span>
          </div>
          <div className="state-row">
            <StatusBadge status="running" running={true} />
            <span className="state-desc"><b>RUNNING</b> — Autonomous navigation active. Blinking indicator; all panels stream live telemetry at 5 Hz (predicted action, goal distance, LiDAR, trajectory).</span>
          </div>
          <div className="state-row">
            <StatusBadge status="running" running={false} />
            <span className="state-desc"><b>PAUSED</b> — Operator paused observation; robot state is frozen, resumed via Resume. Note per UC-09: pausing monitoring does not terminate background navigation.</span>
          </div>
          <div className="state-row">
            <StatusBadge status="reached" running={false} />
            <span className="state-desc"><b>DESTINATION REACHED</b> — Robot arrived within goal radius. Endbar displays elapsed time, total traveled distance, and cycle count; final status remains available.</span>
          </div>
          <div className="state-row">
            <StatusBadge status="terminated" running={false} />
            <span className="state-desc"><b>TERMINATED</b> — Experiment aborted: manual operator abort, <b>obstacle collision</b> (FR-15), or cycle timeout. Reason is displayed in the endbar and logged.</span>
          </div>
        </div>
        <div className="state-flow">
          <span className="sf-node">STANDBY</span>
          <span className="sf-arrow">→ start →</span>
          <span className="sf-node n-run">RUNNING</span>
          <span className="sf-arrow">→ goal reached →</span>
          <span className="sf-node n-done">REACHED</span>
          <span className="sf-arrow" style={{ marginLeft: "6mm" }}>or</span>
          <span className="sf-node n-term">TERMINATED</span>
          <span className="sf-arrow">← collision / operator / timeout</span>
        </div>
      </Sheet>

      <Sheet n={4} total={TOTAL} title="04 · Detailed Components I">
        <div className="fig-grid">
          <Figure
            name="Action Hero (Dual Mode: Predict / Manual)"
            tag="FR-04 · FR-05 · FR-12 · FR-17"
            desc="Shared dual-mode component: (1) Data Collection (UC-02): displays manual keyboard inputs (W/A/S/D) for instant verification of ground-truth labels bound to sensor features; (2) Autonomous Navigation (UC-07): displays live ML model predictions at 5 Hz — 42px font, dedicated class chips."
          >
            <ActionHero state={RUNNING} />
          </Figure>
          <Figure
            name="Robot Telemetry"
            tag="FR-02 · FR-15"
            desc="Linear velocity (m/s), angular velocity (rad/s), destination angular deviation (degrees with L/R indicator), and total traveled distance — 4 monospace tabular readouts updated at 5 Hz."
          >
            <Panel title="Robot Telemetry" label="Robot telemetry">
              <TelemetryGrid state={RUNNING} />
            </Panel>
          </Figure>
          <Figure
            name="Distance to Goal"
            tag="FR-17"
            desc="Remaining Euclidean distance to destination in large numerals with completion progress bar (%) relative to initial distance; shows target coordinates for verification."
          >
            <GoalPanel state={RUNNING} />
          </Figure>
          <Figure
            name="Status Badge & Operator Controls"
            tag="UC-07 · FR-17"
            desc="Lifecycle status badge (pulsing green dot when RUNNING) + elapsed clock; simulation speed presets (1×/4×/16×), Start/Pause/Resume, Terminate (red border), and Restart."
          >
            <div className="fig-controls">
              <div className="fc-row">
                <StatusBadge status="running" running={true} />
                <div className="clock-chip">
                  <span className="micro">Elapsed</span>
                  <span className="clock">{Sim.fmtClock(RUNNING.t)}</span>
                </div>
              </div>
              <div className="fc-row">
                <div className="btn-group">
                  <button className="btn">1×</button>
                  <button className="btn active">4×</button>
                  <button className="btn">16×</button>
                </div>
                <button className="btn"><IconPlay />Start</button>
                <button className="btn"><IconPause />Pause</button>
              </div>
              <div className="fc-row">
                <button className="btn danger"><IconTerminate />Terminate</button>
                <button className="btn"><IconRestart />Restart</button>
              </div>
            </div>
          </Figure>
        </div>
      </Sheet>

      <Sheet n={5} total={TOTAL} title="05 · Detailed Components II">
        <div className="two-col">
          <Figure
            name="Warehouse — Top View"
            tag="FR-01 · FR-02"
            desc="20 × 14 m warehouse floor plan from above: 1 m grid, storage racks (gray blocks), destination (green GOAL ring), spawn point, traveled path trail, and 5 LiDAR rays colored by proximity — triangular robot pointing along heading."
            bodyStyle={{ minHeight: "120mm" }}
          >
            <MapPanel state={RUNNING} />
          </Figure>
          <Figure
            name="LiDAR — Directional Min Distance"
            tag="FR-03"
            desc="240° radar fan showing 5 directional sectors per specification: front ±15°, front-left 15–60°, left 60–120°, front-right −60…−15°, right −120…−60°. Sector radius = minimum distance (max 4 m); color zones: Blue > 1.4 m (Safe), Amber 0.6–1.4 m (Caution), Red < 0.6 m (Danger)."
          >
            <RadarPanel state={RUNNING} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={6} total={TOTAL} title="06 · Operator Console, Cycle Log & Traceability">
        <div className="two-col" style={{ minHeight: "68mm", flex: 1 }}>
          <Figure
            name="Operator Console"
            tag="UC-07 · UC-09"
            desc="CLI terminal for System Operator commands: start / pause / resume / terminate / restart, speed <1|4|16>, goal <x> <y> (dynamically retarget destination), status, clear. Up/down arrow history; all commands logged to Cycle Log."
          >
            <Terminal lines={SAMPLE_TERM} onCommand={() => {}} />
          </Figure>
          <Figure
            name="Navigation Cycle Log"
            tag="FR-14 · FR-15 · FR-17"
            desc="Cycle-by-cycle record of sensing–prediction–action loop at 5 Hz (cycle ID, timestamp, predicted action, front & goal distances); significant events (start, retarget, pause, reached, collision) highlighted for reporting."
          >
            <CycleLog entries={SAMPLE_LOG} />
          </Figure>
        </div>
        <div className="dash-flow-note">
          <table className="df">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Component / UI Region</th>
                <th>Displayed Information &amp; Data Source</th>
                <th style={{ width: "17%" }}>Requirement</th>
              </tr>
            </thead>
            <tbody>
              {DF_ROWS.map(([c, d, f]) => (
                <tr key={c}>
                  <td><b>{c}</b></td>
                  <td>{d}</td>
                  <td className="mono">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>

      <Sheet n={7} total={TOTAL} title="07 · DS Workspace — Model Registry & A/B Comparison">
        <div className="two-col">
          <Figure
            name="Model Registry"
            tag="FR-08 · FR-10 · FR-11 · UC-06"
            desc="Added after review (W1) — a dedicated model-management workspace for the Data Scientist: table of the 4 algorithms (KNN, GNB, DT, RF) with .pkl artifact, validation accuracy, F1, inference time; detail block with hyperparameters, training time and source dataset. Three actions: Activate & Deploy (hot-swap the pipeline model even mid-run), Set as Shadow B (pick a comparison candidate), and Upload model (.pkl/.joblib/.onnx) into the registry pending validation."
          >
            <ModelRegistryPanel
              models={Sim.MODELS}
              deployedId="rf_v14"
              shadowId="dt_v12"
              selectedId="rf_v14"
              onSelect={() => {}}
              onActivate={() => {}}
              onSetShadow={() => {}}
              onUpload={() => {}}
            />
          </Figure>
          <Figure
            name="A/B Model Comparison"
            tag="FR-16 · UC-08"
            desc="Added after review (W3) — direct comparison of two models on the same cycles: card A (deployed) and card B (shadow) show live accuracy computed against expert reference labels, winner outlined in green. The table below aggregates navigation-level history per model from previous sessions: runs, success rate, collision rate, average travel time and distance."
          >
            <ABComparePanel models={Sim.MODELS} deployedId="rf_v14" shadowId="dt_v12" ds={SAMPLE_DS} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={8} total={TOTAL} title="08 · DS Workspace — Prediction Quality & Confusion Matrix">
        <div className="two-col">
          <Figure
            name="Prediction Quality — Live"
            tag="FR-09 · FR-12 · UC-08"
            desc="Added after review (W2) — four direct metrics: live accuracy against expert reference labels, current-cycle confidence, mismatch count, and scored cycles; a 200-cycle rolling accuracy chart; the mismatch review list enumerates cycles where the model diverged from the expert with context (front distance, goal angle) so the DS can extract and analyze failure cases after the experiment."
          >
            <PredictionQualityPanel state={RUNNING} ds={SAMPLE_DS} deployed={Sim.MODELS[0]} />
          </Figure>
          <Figure
            name="Confusion Matrix — Model vs Expert"
            tag="FR-09"
            desc="Added after review (W2) — a real-time confusion matrix between the expert reference action (rows) and the model prediction (columns): diagonal cells shade green with frequency, off-diagonal disagreements shade red; the last row is per-class recall, the footer aggregates agreement %. Data accumulates every 5 Hz cycle while the experiment runs."
          >
            <ConfusionMatrixPanel ds={SAMPLE_DS} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={9} total={TOTAL} title="09 · DS Workspace — Decision Explainer & Dataset Export">
        <div className="two-col">
          <Figure
            name="Decision Explainer (XAI)"
            tag="FR-12 · extension"
            desc="Added after review (W4) — decision explanation via feature attribution: signed bars show factors supporting (green) or pushing against (red) the decision, per-factor weight %, with the dominant factor emphasized; the rule trace restates the decision using the problem's own thresholds (front < 0.75 m, |goal angle| > 31.5°) — revealing which LiDAR zone or heading deviation most influenced the turn/stop so the DS can tune the algorithm."
          >
            <DecisionExplainerPanel state={RUNNING} />
          </Figure>
          <Figure
            name="Dataset & Export"
            tag="FR-06 · UC-02"
            desc="Added after review (W3) — the retraining-data export flow: run ID, collected cycles, mismatched labels (model ≠ expert), estimated size; toggle chips select export columns (5 LiDAR zones, goal_dist, goal_angle, action, expert, confidence, v, w); the Export CSV button downloads a real file — labels include the expert reference action so the DS can relabel before retraining."
          >
            <DatasetExportPanel
              runId="RUN-20261107-A"
              cycles={SAMPLE_DS.cycles}
              mismatches={SAMPLE_DS.mismatches}
              cols={Sim.CSV_COLS}
              onToggleCol={() => {}}
              onExport={() => {}}
            />
          </Figure>
        </div>
      </Sheet>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
