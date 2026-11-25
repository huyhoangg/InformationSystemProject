async function liveRequest(path, payload, timeout = 2500) {
  const request = { signal: AbortSignal.timeout(timeout) };
  if (payload) {
    request.method = "POST";
    request.headers = { "Content-Type": "application/json" };
    request.body = JSON.stringify(payload);
  }
  const response = await fetch(path, request);
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("Navigation Monitor service unavailable");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

const LIVE_MANUAL_COMMANDS = [
  ["a", "left", "Left"],
  ["w", "forward", "Forward"],
  ["d", "right", "Right"],
  ["s", "stop", "Record STOP"],
];

function useNavigationTrace(scenario, runId, active, paused = false) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (paused) return;
    let mounted = true;
    let timer;
    const params = new URLSearchParams({ scenario });
    if (runId) params.set("run", runId);
    async function refresh() {
      try {
        const result = await liveRequest("/api/navigation/cycles?" + params);
        if (mounted) { setData(result); setError(""); }
      } catch (failure) {
        if (mounted) { setData(null); setError(failure.message); }
      } finally {
        if (mounted && active) timer = setTimeout(refresh, 500);
      }
    }
    refresh();
    return () => { mounted = false; clearTimeout(timer); };
  }, [scenario, runId, active, paused]);
  return { trace: !runId || data?.trace?.id === runId ? data?.trace : null, columns: data?.columns || [], error };
}

function LiveCycleLog({ trace, error }) {
  if (!trace) return <Panel title="Navigation Cycle Log">
    <p className={error ? "live-error" : "live-detail"}>{error || "Start a run to record cycles and events."}</p>
  </Panel>;
  const entries = [
    ...trace.events.map((event) => ({ kind: "event", t: event.elapsed_s, tone: "muted", text: event.message })),
    ...trace.rows.map((row) => {
      const action = row.model_action || row.operator_action || row.command;
      return { kind: "cycle", t: row.elapsed_s, cycle: row.cycle, action: action.toUpperCase(),
        sent: action === row.command ? null : row.command.toUpperCase(), front: row.front, goalDist: row.goal_distance };
    }),
  ].sort((a, b) => a.t - b.t).slice(-250);
  return <CycleLog entries={entries} />;
}

function LiveConsole({ snapshot, send, observe }) {
  const [lines, setLines] = React.useState([{ kind: "system", text: "Type help for available commands." }]);
  const inFlight = React.useRef(false);
  const add = (text, kind = "system") => setLines((previous) => [...previous.slice(-99), { kind, text, t: snapshot.elapsed }]);
  async function command(text) {
    if (inFlight.current) return;
    const [name, ...args] = text.trim().split(/\s+/);
    if (name === "clear" && !args.length) { setLines([]); return; }
    add(text, "input");
    if (name === "help" && !args.length) {
      add("start · pause · resume · terminate · restart · goal <x> <y> · model use <model-id> or <run-id>/<model-id> · status · clear");
      return;
    }
    if (name === "status" && !args.length) {
      add(`${snapshot.mode} · ${snapshot.reason} · cycle ${snapshot.navigation?.cycle_count || 0} · ${snapshot.command}`);
      return;
    }
    const actions = { start: "start", terminate: "stop", restart: "reset" };
    let action = null;
    let params;
    if (Object.hasOwn(actions, name) && !args.length) action = actions[name];
    if (name === "goal" && args.length === 2 && args.every((value) => Number.isFinite(Number(value)))) {
      action = "set_goal";
      params = { x: Number(args[0]), y: Number(args[1]), retarget: true };
    }
    if (name === "model" && args.length === 2 && args[0] === "use") {
      const parts = args[1].split("/");
      if (parts.length === 1 || parts.length === 2) {
        action = "model";
        params = { run_id: parts.length === 2 ? parts[0] : snapshot.active_run,
          model: parts.at(-1), hot_swap: true };
      }
    }
    const pause = (name === "pause" || name === "resume") && !args.length && snapshot.mode === "auto";
    if (!action && !pause) { add("Command unavailable. Type help.", "error"); return; }
    inFlight.current = true;
    try {
      if (snapshot.mode !== "idle") await send("console_event", { text: text.replace(/\s+/g, " ").slice(0, 100) });
      const ok = pause ? await observe(name === "pause") : await send(action, params);
      add(ok ? "Command accepted." : "Command failed. See the status message.", ok ? "system" : "error");
    } finally {
      inFlight.current = false;
    }
  }
  return <Terminal lines={lines} onCommand={command} />;
}

function NavigationRuns({ scenario, lastRunId, sessionId, saveError }) {
  const [runs, setRuns] = React.useState(null);
  const [error, setError] = React.useState("");
  const [allSessions, setAllSessions] = React.useState(false);
  const query = new URLSearchParams({ scenario });
  if (sessionId && !allSessions) query.set("session", sessionId);
  const filter = "?" + query;

  React.useEffect(() => {
    let active = true;
    setRuns(null);
    setError("");
    liveRequest("/api/navigation/runs" + filter)
      .then((result) => {
        if (!active) return;
        setRuns(result.runs);
        setError("");
      })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [lastRunId, filter]);

  return (
    <Panel title="Navigation Runs">
      {sessionId && <label className="live-field">
        <span>History</span>
        <select value={allSessions ? "all" : "current"} onChange={(event) => setAllSessions(event.target.value === "all")}>
          <option value="current">This session</option>
          <option value="all">All sessions</option>
        </select>
      </label>}
      {saveError && <p className="live-error" role="alert">{saveError}</p>}
      {error && <p className="live-error" role="alert">{error}</p>}
      {!runs && !error && <p className="live-detail" role="status">Loading runs…</p>}
      {runs?.length === 0 && <p className="live-detail">Completed manual and autonomous runs will appear here.</p>}
      {runs?.length > 0 && <>
        <div className="live-run-list">
          {runs.map((run) => (
            <details key={run.id} className="live-run">
              <summary>
                <strong>{run.drive_mode === "manual" ? "Manual" : run.model_label || run.model}</strong>
                <span>{run.status === "reached" ? "Reached" : "Terminated"}</span>
                <time dateTime={run.started_at}>{new Date(run.started_at).toLocaleString()}</time>
              </summary>
              <p className="live-detail">{run.reason}</p>
              <p className="live-detail">Goal · ({run.goal_x.toFixed(2)}, {run.goal_y.toFixed(2)}) m</p>
              <dl className="live-action-values">
                <div><dt>Elapsed</dt><dd>{run.elapsed_s.toFixed(2)} s</dd></div>
                <div><dt>Distance traveled</dt><dd>{run.distance_m.toFixed(2)} m</dd></div>
                <div><dt>Collision</dt><dd>{run.collision === null ? "Unknown" : run.collision ? "Yes" : "No"}</dd></div>
                {run.drive_mode !== "manual" && <div><dt>Mean inference</dt><dd>
                  {run.mean_inference_ms === null ? "—" : run.mean_inference_ms.toFixed(2) + " ms"}
                </dd></div>}
              </dl>
              {run.contact_objects.length > 0 && <p className="live-detail">{run.contact_objects.join(", ")}</p>}
              {run.comparison_eligible === false && <p className="live-detail">Goal or model changed during this run.</p>}
              {run.cycle_count > 0 && <a className="btn small" href={"/api/navigation/cycles.csv?" + new URLSearchParams({ scenario, run: run.id })}>Download cycles</a>}
              {run.model_run_id && <p className="live-detail">Training run · {run.model_run_id}</p>}
            </details>
          ))}
        </div>
        <div className="live-actions live-ds-actions">
          <a className="btn" href={"/api/navigation/runs.csv" + filter}>Download runs CSV</a>
        </div>
      </>}
    </Panel>
  );
}

function LiveRobot({ setup, snapshot, frozen, observe, send, pending }) {
  const [picking, setPicking] = React.useState(false);
  const heldAction = React.useRef(null);
  const canDrive = snapshot.ready && !pending;
  const canDriveManually = canDrive && snapshot.mode === "manual";
  const canRecordArrival = canDrive && snapshot.record_stop_available;
  const idle = snapshot.mode === "idle";
  const paused = Boolean(frozen);
  const shown = frozen || snapshot;
  const traceId = snapshot.navigation?.id || snapshot.last_navigation_id;
  const { trace, error: traceError } = useNavigationTrace(snapshot.scenario, traceId, !idle, paused);
  const destination = snapshot.goal;
  const world = snapshot.map;
  const atGoal = destination && Number.isFinite(snapshot.goal_distance) && snapshot.goal_distance <= destination.radius;
  React.useEffect(() => {
    if (!idle || snapshot.resetting) setPicking(false);
  }, [idle, snapshot.resetting]);

  React.useEffect(() => {
    if (snapshot.mode !== "manual" && !snapshot.record_stop_available) {
      heldAction.current = null;
      return;
    }
    function drive(event) {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey
          || event.target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName)) return;
      const shortcut = LIVE_MANUAL_COMMANDS.find(([key]) => key === event.key.toLowerCase());
      if (shortcut && (canDriveManually || (canRecordArrival && shortcut[1] === "stop"))) {
        event.preventDefault();
        heldAction.current = shortcut[1] === "stop" ? null : shortcut[1];
        send("manual", { action: shortcut[1] });
      }
    }
    function release(event) {
      const shortcut = LIVE_MANUAL_COMMANDS.find(([key]) => key === event.key.toLowerCase());
      if (shortcut && heldAction.current === shortcut[1]) {
        heldAction.current = null;
        send("release_manual", { action: shortcut[1] });
      }
    }
    window.addEventListener("keydown", drive);
    window.addEventListener("keyup", release);
    return () => {
      window.removeEventListener("keydown", drive);
      window.removeEventListener("keyup", release);
    };
  }, [canDriveManually, canRecordArrival, send, snapshot.mode, snapshot.record_stop_available]);

  if (!world) return <main className="main live-ds">
    <div className="col">
      <Panel title="Robot Control"><p className="live-detail">Gazebo is disconnected in offline mode.</p></Panel>
      <NavigationRuns scenario={snapshot.scenario} lastRunId={snapshot.last_navigation_id} />
    </div>
  </main>;
  const { mode, pose, prediction, command, reason, traveled, trail, range_max, goal_distance, goal_angle } = shown;
  const navigation = shown.navigation;
  const progress = navigation && Number.isFinite(goal_distance) && navigation.initial_goal_distance > 0
    ? snapshot.goal_reached ? 100 : Math.round(100 * Math.max(0, Math.min(1, 1 - goal_distance / navigation.initial_goal_distance))) : null;
  const sectors = Sim.SECTORS.map(({ key, label }) => ({
    key, label,
    a0: setup.sector_angles[key] - setup.half_width,
    a1: setup.sector_angles[key] + setup.half_width,
  }));
  const pointOnMap = ([x, y]) => ({ x: x - world.min_x, y: y - world.min_y });
  const mapState = pose && {
    ...pointOnMap([pose.x, pose.y]),
    heading: pose.heading,
    trail: trail.map(pointOnMap),
    sectors: shown.sectors,
  };
  const goal = shown.goal && { ...pointOnMap([shown.goal.x, shown.goal.y]), radius: shown.goal.radius };
  async function setGoal(x, y) {
    if (await send("set_goal", { x, y })) setPicking(false);
  }
  function pickGoal(x, y) {
    setGoal(Number((x + world.min_x).toFixed(2)), Number((y + world.min_y).toFixed(2)));
  }
  const telemetry = [
    ["X", pose?.x, "m"], ["Y", pose?.y, "m"],
    ["Linear velocity", pose?.v, "m/s"], ["Angular velocity", pose?.w, "rad/s"],
    ["Heading", pose && pose.heading * 180 / Math.PI, "°"], ["Traveled", traveled, "m"],
  ];
  return (
    <main className="main live-main">
      <div className="col">
        <Panel title="Robot Control" note={world.robot}>
          <div className="live-actions">
            <button className="btn primary" disabled={!canDrive || !idle || picking || atGoal} onClick={() => send("start_manual")}>
              <IconPlay /> Start manual
            </button>
            <button className="btn" disabled={!canDrive || !idle || picking || atGoal || !snapshot.active_model} onClick={() => send("start")}>
              <IconPlay /> Start autonomous
            </button>
            <button className="btn danger" disabled={pending || idle} onClick={() => send("stop")}>
              <IconStop /> End run
            </button>
            <button className="btn" disabled={pending || snapshot.mode !== "auto"} onClick={() => observe(!paused)}>
              {paused ? "Resume observation" : "Pause observation"}
            </button>
          </div>
          {!idle && <p className="live-detail">Elapsed · {Sim.fmtClock(shown.elapsed)}</p>}
          <p className="live-detail">{snapshot.active_model
            ? `Model for autonomous runs · ${snapshot.active_model_label} · ${snapshot.active_run}`
            : "Train and select a model for autonomous runs."}</p>
          <div className="live-actions live-manual" aria-label="Manual controls">
            {LIVE_MANUAL_COMMANDS.map(([key, action, label]) => (
              <button key={action} className="btn" aria-keyshortcuts={key.toUpperCase()}
                disabled={!canDriveManually && !(action === "stop" && canRecordArrival)}
                onClick={() => send("manual", { action })}>{label}</button>
            ))}
          </div>
          {snapshot.record_stop_available && <p className="live-detail">Press S to record STOP at the destination.</p>}
          <p className="live-detail">In a manual run, use W/A/D to drive and S to record STOP. The run ends at the goal or when you select End run.</p>
          <p className="live-detail" role="status">{paused ? "Observation paused. Autonomous run continues." : reason}</p>
        </Panel>
        {goal && <Panel title="Goal" note={`Radius ${destination.radius} m`}>
          <dl className="live-action-values">
            <div><dt>Distance</dt><dd>{Number.isFinite(goal_distance) ? `${goal_distance.toFixed(2)} m` : "—"}</dd></div>
            <div><dt>Heading error</dt><dd>{Number.isFinite(goal_angle) ? `${(goal_angle * 180 / Math.PI).toFixed(1)}°` : "—"}</dd></div>
          </dl>
          {progress !== null && <label className="live-progress"><span>Goal progress · {progress}%</span>
            <progress value={progress} max="100" /></label>}
          <form className="live-goal-form" key={`${destination.x},${destination.y},${snapshot.session_id}`}
            onSubmit={(event) => {
              event.preventDefault();
              const { x, y } = event.currentTarget.elements;
              setGoal(x.valueAsNumber, y.valueAsNumber);
            }}>
            <label className="live-field"><span>X (m)</span>
              <input name="x" type="number" step="any" required defaultValue={destination.x} disabled={!canDrive || !idle} />
            </label>
            <label className="live-field"><span>Y (m)</span>
              <input name="y" type="number" step="any" required defaultValue={destination.y} disabled={!canDrive || !idle} />
            </label>
            <button className="btn" type="submit" disabled={!canDrive || !idle}>Set goal</button>
          </form>
          <button className="btn live-pick-goal" disabled={!canDrive || !idle} aria-pressed={picking}
            onClick={() => setPicking(!picking)}>{picking ? "Cancel picking" : "Pick on map"}</button>
          {picking && <p className="live-detail" role="status">Click an open point on the map.</p>}
          {!picking && idle && atGoal && <p className="live-detail">Choose a new goal to start another run.</p>}
        </Panel>}
        <Panel title="Robot Action" note={mode === "manual" ? "MANUAL" : "MODEL"}>
          <p className="live-action-label">{prediction ? "Last prediction" : mode === "manual" ? "Manual action" : "Current command"}</p>
          <div className="live-action-hero" style={{ color: ACTION_META[(prediction || command).toUpperCase()]?.color }}>
            {(prediction || command).toUpperCase()}
          </div>
          <div className="live-action-classes" aria-label="Movement classes">
            {Object.keys(ACTION_META).map((label) => <span key={label}
              className={label === (prediction || command).toUpperCase() ? "selected" : ""}>{label}</span>)}
          </div>
          <dl className="live-action-values">
            <div><dt>Command sent</dt><dd>{command.toUpperCase()}</dd></div>
            <div><dt>Confidence</dt><dd>{Number.isFinite(shown.confidence) ? (shown.confidence * 100).toFixed(1) + "%" : "—"}</dd></div>
          </dl>
          {navigation && <p className="live-detail">Cycle {navigation.cycle_count} · {Sim.fmtClock(shown.elapsed)}</p>}
        </Panel>
        <Panel title="Robot Telemetry" note="/odom">
          <div className="tele-grid">
            {telemetry.map(([label, value, unit]) => (
              <div key={label} className="tele-cell">
                <span className="micro">{label}</span>
                <span className="val">{Number.isFinite(value) ? <>{value.toFixed(2)}<span className="unit">{unit}</span></> : "—"}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="col">
        {idle && navigation?.end_reason && <div className={`endbar ${snapshot.goal_reached ? "reached" : "terminated"}`}>
          <span>{snapshot.reason}</span><span className="end-meta">{Sim.fmtClock(shown.elapsed)} · {navigation.distance_m.toFixed(2)} m · {navigation.cycle_count} cycles</span>
        </div>}
        {mapState ? <MapPanel state={mapState} world={world} obstacles={world.obstacles}
          start={navigation ? pointOnMap([navigation.start_x, navigation.start_y]) : null} goal={goal} sectors={sectors} markerScale={0.26} title={world.label + " — Top View"} label="Gazebo map"
          onPickGoal={picking && canDrive && idle ? pickGoal : undefined} />
          : <Panel title="Gazebo Arena">Waiting for odometry</Panel>}
      </div>
      <div className="col">
        {range_max ? <RadarPanel state={shown} sectors={sectors} maxRange={range_max} />
          : <Panel title="LiDAR">Waiting for a scan</Panel>}
        <LiveCycleLog trace={trace} error={traceError} />
        <LiveConsole snapshot={snapshot} send={send} observe={observe} />
        <NavigationRuns key={snapshot.session_id} scenario={snapshot.scenario} sessionId={snapshot.session_id}
          lastRunId={snapshot.last_navigation_id} saveError={snapshot.navigation_save_error} />
      </div>
    </main>
  );
}

function LiveApp() {
  const [setup, setSetup] = React.useState(null);
  const [snapshot, setSnapshot] = React.useState(null);
  const [connected, setConnected] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [view, setView] = React.useState(location.hash === "#ds" ? "ds" : "operator");
  const [frozen, setFrozen] = React.useState(null);
  const [theme, setTheme] = React.useState(document.documentElement.dataset.theme || "light");
  const statusVersion = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    let timer;
    let config;
    async function refresh() {
      try {
        if (!config) {
          config = await liveRequest("/api/setup");
          if (active) setSetup(config);
        }
        const version = statusVersion.current;
        const status = await liveRequest("/api/status");
        if (active && version === statusVersion.current) {
          setSnapshot(status);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        if (active) timer = setTimeout(refresh, 200);
      }
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  const send = React.useCallback(async (command, args) => {
    setPending(true);
    setError("");
    try {
      const status = await liveRequest("/api/control", { command, scenario: snapshot?.scenario, ...args });
      statusVersion.current += 1;
      setSnapshot(status);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setPending(false);
    }
  }, [snapshot?.scenario]);

  const observation = snapshot?.mode === "auto" && frozen?.navigation?.id === snapshot?.navigation?.id ? frozen : null;
  async function observe(paused) {
    if (snapshot?.mode !== "auto") return false;
    if (!await send("observation", { paused })) return false;
    setFrozen(paused ? snapshot : null);
    return true;
  }

  const chooseView = (next) => {
    setView(next);
    history.replaceState(null, "", next === "ds" ? "#ds" : location.pathname + location.search);
  };
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("nav-monitor-theme", next); } catch {}
  };
  const offline = setup && !setup.live;
  const running = snapshot && snapshot.mode !== "idle";
  return (
    <div className="app live-app">
      <header className="topbar">
        <div className="title-block">
          <h1>NAVIGATION MONITOR</h1>
          <span className="title-meta">{setup?.adapter} <strong>{snapshot?.active_model_label ? "· " + snapshot.active_model_label : ""}</strong></span>
        </div>
        <div className="view-tabs" aria-label="Monitor views">
          <button className={view === "operator" ? "active" : ""} onClick={() => chooseView("operator")}>Operator View</button>
          <button className={view === "ds" ? "active" : ""} onClick={() => chooseView("ds")}>DS Workspace</button>
        </div>
        <div className="topbar-spacer"></div>
        <div className="top-right">
          {setup && snapshot && <label className="live-world-switch">
            <span>Map</span>
            <select value={snapshot.scenario} disabled={pending || running || snapshot.resetting}
              onChange={(event) => send("select_scenario", { scenario: event.target.value })}>
              {setup.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
          </label>}
          <span className={`badge ${connected && snapshot?.ready ? "running" : "standby"}`} role="status">
            <span className="dot"></span>{!connected ? "CONNECTING" : offline ? "OFFLINE DATASETS"
              : snapshot?.resetting ? "RESETTING SIMULATOR" : snapshot?.ready ? "SIMULATOR CONNECTED" : "WAITING FOR SIMULATOR"}
          </span>
          {connected && !offline && !snapshot?.resetting && <StatusBadge
            status={running ? "running" : snapshot?.last_navigation_status || "standby"}
            running={running && !observation} />}
          <div className="controls">
            {setup?.live && <button className="btn" disabled={pending || !snapshot?.reset_available || snapshot?.resetting}
              onClick={() => send("reset")}>Reset session</button>}
            <button className="btn" onClick={toggleTheme}>{theme === "light" ? <IconMoon /> : <IconSun />}{theme === "light" ? "Dark" : "Light"}</button>
          </div>
        </div>
      </header>
      {error && <p className="live-notice" role="alert">{error}</p>}
      {setup && connected && snapshot
        ? view === "operator" ? <LiveRobot key={snapshot.scenario} setup={setup} snapshot={snapshot} frozen={observation}
            observe={observe} send={send} pending={pending} />
          : <LiveDataScience key={snapshot.scenario} packagedReport={setup.reports[snapshot.scenario]}
              packagedNote={setup.scenarios.find((scenario) => scenario.id === snapshot.scenario)?.dataset_note}
              offline={offline} snapshot={snapshot} send={send} pending={pending} />
        : <p className="live-notice">Connecting to the Navigation Monitor service…</p>}
    </div>
  );
}
