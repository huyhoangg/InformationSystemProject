const SPEEDS = [1, 4, 16];
const EMPTY_DS = () => ({
  cycles: 0,
  matches: 0,
  mismatches: 0,
  confusion: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  accHist: [],
  mismList: [],
  shadowCycles: 0,
  shadowMatches: 0,
});

function App() {
  const [state, setState] = React.useState(Sim.makeInitialState);
  const [running, setRunning] = React.useState(false);
  const [speed, setSpeed] = React.useState(4);
  const [log, setLog] = React.useState(() => [Sim.logEvent("Monitor connected. Experiment on standby.", "info")]);
  const [theme, setTheme] = React.useState(() => document.documentElement.getAttribute("data-theme") || "light");
  const [termLines, setTermLines] = React.useState(() => [
    { kind: "info", text: "Operator console ready. Type help for commands.", t: 0 },
  ]);

  const [view, setView] = React.useState(() => (window.location.hash === "#ds" ? "ds" : "operator"));
  const [registry, setRegistry] = React.useState(Sim.MODELS);
  const [deployedId, setDeployedId] = React.useState(Sim.MODELS[0].id);
  const [shadowId, setShadowId] = React.useState(null);
  const [selectedModelId, setSelectedModelId] = React.useState(Sim.MODELS[0].id);
  const [ds, setDs] = React.useState(EMPTY_DS);
  const [csvCols, setCsvCols] = React.useState(Sim.CSV_COLS);
  const runId = React.useRef("RUN-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-A");

  const switchView = (v) => {
    setView(v);
    try {
      window.history.replaceState(null, "", v === "ds" ? "#ds" : window.location.pathname + window.location.search);
    } catch (e) {}
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("nav-monitor-theme", next);
    } catch (e) {}
    setTheme(next);
  };

  const stateRef = React.useRef(state);
  stateRef.current = state;
  const runningRef = React.useRef(running);
  runningRef.current = running;
  const speedRef = React.useRef(speed);
  speedRef.current = speed;
  const accRef = React.useRef(0);
  const deployedRef = React.useRef(deployedId);
  deployedRef.current = deployedId;
  const shadowRef = React.useRef(shadowId);
  shadowRef.current = shadowId;
  const recentRef = React.useRef([]);

  React.useEffect(() => {
    const iv = setInterval(() => {
      if (!runningRef.current) return;
      const cur = stateRef.current;
      if (cur.status !== "running") return;
      accRef.current += (0.1 * speedRef.current) / Sim.DT;
      let s = cur;
      const rows = [];
      const preds = [];
      let guard = 0;
      while (accRef.current >= 1 && guard < 500) {
        accRef.current -= 1;
        guard += 1;
        const model = registry.find((m) => m.id === deployedRef.current) || Sim.MODELS[0];
        const r = Sim.step(s, model);
        s = r.state;
        rows.push(Sim.cycleEntry(s, r.pred));
        preds.push(r.pred);
        if (r.event) rows.push(r.event);
        if (s.status !== "running") {
          accRef.current = 0;
          break;
        }
      }
      if (guard > 0) {
        setState(s);
        setLog((l) => [...l, ...rows].slice(-250));
        setDs((d) => {
          const n = {
            ...d,
            confusion: d.confusion.map((row) => [...row]),
            accHist: d.accHist.slice(-200),
            mismList: d.mismList.slice(-6),
          };
          for (const p of preds) {
            if (!p) continue;
            n.cycles += 1;
            const ei = Sim.CLASSES.indexOf(p.expert);
            const ai = Sim.CLASSES.indexOf(p.action);
            if (ei >= 0 && ai >= 0) n.confusion[ei][ai] += 1;
            if (p.match) n.matches += 1;
            else {
              n.mismatches += 1;
              n.mismList = [
                ...n.mismList.slice(-5),
                { cycle: s.cycle, action: p.action, expert: p.expert, front: s.sectors.front, angle: (s.goalAngle * 180) / Math.PI },
              ];
            }
            recentRef.current.push(p.match ? 1 : 0);
            if (recentRef.current.length > 200) recentRef.current.shift();
            n.accHist = [...n.accHist.slice(-199), (recentRef.current.reduce((a, b) => a + b, 0) / recentRef.current.length) * 100];
            const B = registry.find((m) => m.id === shadowRef.current);
            if (B) {
              n.shadowCycles += 1;
              if (Sim.shadowPick(p.expert, B) === p.expert) n.shadowMatches += 1;
            }
          }
          return n;
        });
      }
    }, 100);
    return () => clearInterval(iv);
  }, [registry]);

  const pushEvent = (text, tone) =>
    setLog((l) => [...l, { ...Sim.logEvent(text, tone), t: stateRef.current.t }].slice(-250));

  const handleStartPause = () => {
    if (state.status === "standby") {
      setState({ ...state, status: "running" });
      setRunning(true);
      pushEvent("Experiment started. Live monitoring at 5 Hz.", "info");
    } else if (state.status === "running") {
      setRunning(!running);
      pushEvent(running ? "Monitoring paused by operator." : "Monitoring resumed.", "warn");
    }
  };

  const handleTerminate = () => {
    if (state.status !== "running") return;
    setRunning(false);
    setState({ ...state, status: "terminated", endReason: "operator", action: "STOP", v: 0, w: 0 });
    pushEvent("Experiment terminated by operator. Final status kept.", "bad");
  };

  const handleRestart = () => {
    accRef.current = 0;
    recentRef.current = [];
    setState(Sim.makeInitialState());
    setRunning(false);
    setLog([Sim.logEvent("Monitor reset. Experiment on standby.", "info")]);
  };

  const handleActivate = (id) => {
    const m = registry.find((x) => x.id === id);
    if (!m || id === deployedId) return;
    setDeployedId(id);
    pushEvent(`Model ${m.algo} ${m.version} (${m.file}) deployed to the navigation pipeline.`, "good");
  };

  const handleSetShadow = (id) => {
    const m = registry.find((x) => x.id === id);
    if (!m || id === deployedId) return;
    setShadowId((cur) => (cur === id ? null : id));
    pushEvent(
      shadowId === id
        ? `Shadow candidate ${m.algo} ${m.version} removed from A/B comparison.`
        : `Shadow candidate set: ${m.algo} ${m.version} — scoring live against deployed model on same cycles.`,
      "info"
    );
  };

  const handleUpload = (name) => {
    const id = "up_" + Date.now();
    const algoGuess = name.replace(/\.(pkl|joblib|onnx)$/i, "").replace(/[_-]+/g, " ").trim() || "Uploaded model";
    setRegistry((r) => [
      ...r,
      {
        id,
        algo: algoGuess.length > 24 ? algoGuess.slice(0, 24) + "…" : algoGuess,
        version: "new",
        file: name,
        size: "—",
        params: "pending validation — joblib load + feature schema check",
        trained: "—",
        trainTime: "—",
        samples: 0,
        features: 8,
        dataset: "—",
        infer: 0,
        val: null,
        err: 0.09,
        status: "uploaded",
      },
    ]);
    setSelectedModelId(id);
    pushEvent(`Model artifact ${name} uploaded — added to registry as CANDIDATE (validation pending).`, "warn");
  };

  const handleExport = () => {
    const csv = Sim.buildCSV(log, csvCols);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nav_monitor_cycles_${runId.current}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    const n = log.filter((e) => e.kind === "cycle").length;
    pushEvent(`Dataset exported: ${n} cycles → ${a.download} (${csvCols.filter((c) => c.on).length} columns).`, "good");
  };

  const handleToggleCol = (key) =>
    setCsvCols((cols) => cols.map((c) => (c.key === key ? { ...c, on: !c.on } : c)));

  const pushTerm = (kind, text) =>
    setTermLines((l) => [...l, { kind, text, t: stateRef.current.t }].slice(-200));

  const runCommand = (raw) => {
    const input = raw.trim();
    pushTerm("input", input);
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const s = stateRef.current;
    const ended = s.status === "reached" || s.status === "terminated";
    switch (cmd) {
      case "help":
        [
          "start            begin autonomous navigation",
          "pause / resume   pause or resume the monitoring loop",
          "terminate        end the experiment",
          "restart          reset experiment to standby",
          "speed <1|4|16>   set simulation speed",
          "goal <x> <y>     set destination, world is 20 x 14 m",
          "model            list model registry (deployed / shadow / candidate)",
          "model use <id>   deploy a registry model into the pipeline",
          "status           print current navigation status",
          "clear            clear console",
        ].forEach((t) => pushTerm("info", t));
        break;
      case "model": {
        if (args.length === 0) {
          registry.forEach((m) =>
            pushTerm(
              "info",
              `${m.id.padEnd(10)} ${m.algo.padEnd(14)} ${m.version.padEnd(5)} val=${m.val ? m.val.acc.toFixed(1) + "%" : "  — "} ${
                m.id === deployedId ? "[DEPLOYED]" : m.id === shadowId ? "[SHADOW B]" : "[candidate]"
              }`
            )
          );
          break;
        }
        if (args[0] === "use" && args[1]) {
          const m = registry.find((x) => x.id === args[1]);
          if (!m) {
            pushTerm("err", `Unknown model id "${args[1]}" — run model.`);
            break;
          }
          handleActivate(m.id);
          pushTerm("ok", `${m.algo} ${m.version} deployed.`);
          break;
        }
        pushTerm("err", "Usage: model | model use <id>");
        break;
      }
      case "start":
        if (s.status === "standby") {
          setState({ ...s, status: "running" });
          setRunning(true);
          pushEvent("Experiment started. Live monitoring at 5 Hz.", "info");
          pushTerm("ok", "Experiment started.");
        } else if (s.status === "running") {
          pushTerm("err", "Already running.");
        } else {
          pushTerm("err", "Experiment ended — use restart.");
        }
        break;
      case "pause":
        if (s.status === "running" && runningRef.current) {
          setRunning(false);
          pushEvent("Monitoring paused by operator.", "warn");
          pushTerm("ok", "Paused.");
        } else {
          pushTerm("err", "Not running.");
        }
        break;
      case "resume":
        if (s.status === "running" && !runningRef.current) {
          setRunning(true);
          pushEvent("Monitoring resumed.", "warn");
          pushTerm("ok", "Resumed.");
        } else {
          pushTerm("err", "Not paused.");
        }
        break;
      case "terminate":
        if (s.status === "running") {
          setRunning(false);
          setState({ ...s, status: "terminated", endReason: "operator", action: "STOP", v: 0, w: 0 });
          pushEvent("Experiment terminated by operator. Final status kept.", "bad");
          pushTerm("ok", "Terminated.");
        } else {
          pushTerm("err", "Nothing to terminate.");
        }
        break;
      case "restart":
        handleRestart();
        pushTerm("ok", "Reset to standby.");
        break;
      case "speed": {
        if (args.length === 0) {
          pushTerm("ok", `speed = ${speedRef.current}x`);
          break;
        }
        const v = Number(args[0]);
        if (![1, 4, 16].includes(v)) {
          pushTerm("err", "Usage: speed <1|4|16>");
          break;
        }
        setSpeed(v);
        pushTerm("ok", `speed = ${v}x`);
        break;
      }
      case "goal": {
        if (ended) {
          pushTerm("err", "Experiment ended — use restart.");
          break;
        }
        const x = parseFloat(args[0]);
        const y = parseFloat(args[1]);
        if (isNaN(x) || isNaN(y)) {
          pushTerm("err", "Usage: goal <x> <y>");
          break;
        }
        const r = Sim.setGoal(x, y);
        if (!r.ok) {
          pushTerm("err", r.msg);
          break;
        }
        const ns = { ...s };
        if (s.status === "standby") {
          ns.heading = Math.atan2(Sim.GOAL.y - s.y, Sim.GOAL.x - s.x);
        }
        ns.initialDist = Math.max(0.5, Math.hypot(Sim.GOAL.x - s.x, Sim.GOAL.y - s.y));
        const g = Sim.goalState(ns);
        ns.goalDist = g.goalDist;
        ns.goalAngle = g.goalAngle;
        setState(ns);
        pushEvent(`Destination set to (${Sim.GOAL.x.toFixed(1)}, ${Sim.GOAL.y.toFixed(1)}) via console.`, "warn");
        pushTerm("ok", r.msg);
        break;
      }
      case "status":
        pushTerm(
          "ok",
          `status=${s.status.toUpperCase()} cycle=#${String(s.cycle).padStart(4, "0")} t=${Sim.fmtClock(s.t)} action=${s.action} goal=${Sim.fmt(s.goalDist)}m speed=${speedRef.current}x`
        );
        break;
      case "clear":
        setTermLines([]);
        break;
      default:
        pushTerm("err", `Unknown command "${parts[0]}" — type help.`);
    }
  };

  const startLabel = state.status === "standby" ? "Start" : running ? "Pause" : "Resume";
  const ended = state.status === "reached" || state.status === "terminated";
  const startDisabled = ended;
  const deployed = registry.find((m) => m.id === deployedId) || registry[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <h1>NAVIGATION MONITOR</h1>
          <span className="title-meta">
            deployed model <strong>{deployed.file}</strong> · gazebo/ros2 sim · cycle 5 Hz
          </span>
        </div>
        <div className="view-tabs" role="tablist">
          <button className={view === "operator" ? "active" : ""} onClick={() => switchView("operator")}>
            Operator View
          </button>
          <button className={view === "ds" ? "active" : ""} onClick={() => switchView("ds")}>
            DS Workspace
          </button>
        </div>
        <div className="topbar-spacer"></div>
        <div className="top-right">
          <StatusBadge status={state.status} running={running} />
          <div className="clock-chip">
            <span className="micro">Elapsed</span>
            <span className="clock">{Sim.fmtClock(state.t)}</span>
          </div>
          <div className="controls">
            {new URLSearchParams(location.search).has("mock") && <a className="btn" href="?live=1">Go live</a>}
            <button className="btn" onClick={toggleTheme} title="Toggle light / dark">
              {theme === "light" ? <IconMoon /> : <IconSun />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <div className="btn-group">
              {SPEEDS.map((s) => (
                <button key={s} className={`btn ${speed === s ? "active" : ""}`} onClick={() => setSpeed(s)} disabled={ended}>
                  {s}×
                </button>
              ))}
            </div>
            <button className="btn" onClick={handleStartPause} disabled={startDisabled}>
              {startLabel === "Start" ? <IconPlay /> : startLabel === "Pause" ? <IconPause /> : <IconPlay />}
              {startLabel}
            </button>
            <button className="btn danger" onClick={handleTerminate} disabled={state.status !== "running"}>
              <IconTerminate />
              Terminate
            </button>
            <button className="btn" onClick={handleRestart}>
              <IconRestart />
              Restart
            </button>
          </div>
        </div>
      </header>

      <EndBar state={state} />

      {view === "operator" ? (
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
            <Terminal lines={termLines} onCommand={runCommand} />
          </div>
        </main>
      ) : (
        <main className="main ds-main">
          <div className="col">
            <ModelRegistryPanel
              models={registry}
              deployedId={deployedId}
              shadowId={shadowId}
              selectedId={selectedModelId}
              onSelect={setSelectedModelId}
              onActivate={handleActivate}
              onSetShadow={handleSetShadow}
              onUpload={handleUpload}
            />
            <DatasetExportPanel
              runId={runId.current}
              cycles={ds.cycles}
              mismatches={ds.mismatches}
              cols={csvCols}
              onToggleCol={handleToggleCol}
              onExport={handleExport}
            />
          </div>
          <div className="col">
            <PredictionQualityPanel state={state} ds={ds} deployed={deployed} />
            <ConfusionMatrixPanel ds={ds} />
          </div>
          <div className="col">
            <DecisionExplainerPanel state={state} />
            <ABComparePanel models={registry} deployedId={deployedId} shadowId={shadowId} ds={ds} />
          </div>
        </main>
      )}
    </div>
  );
}

const liveMode = new URLSearchParams(location.search).get("live") === "1";
ReactDOM.createRoot(document.getElementById("root")).render(liveMode ? <LiveApp /> : <App />);
