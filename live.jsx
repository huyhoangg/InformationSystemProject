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

function NavigationRuns({ lastRunId, sessionId, saveError }) {
  const [runs, setRuns] = React.useState(null);
  const [error, setError] = React.useState("");
  const [allSessions, setAllSessions] = React.useState(false);
  const filter = sessionId && !allSessions ? "?" + new URLSearchParams({ session: sessionId }) : "";

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

function LiveRobot({ setup, snapshot, send, pending }) {
  const [picking, setPicking] = React.useState(false);
  const canDrive = snapshot.ready && !pending;
  const canDriveManually = canDrive && snapshot.mode === "manual";
  const idle = snapshot.mode === "idle";
  const destination = snapshot.goal || setup.goal;
  const atGoal = destination && Number.isFinite(snapshot.goal_distance) && snapshot.goal_distance <= destination.radius;
  React.useEffect(() => {
    if (!idle || snapshot.resetting) setPicking(false);
  }, [idle, snapshot.resetting]);

  React.useEffect(() => {
    if (!canDriveManually) return;
    function drive(event) {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey
          || event.target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName)) return;
      const shortcut = LIVE_MANUAL_COMMANDS.find(([key]) => key === event.key.toLowerCase());
      if (shortcut) {
        event.preventDefault();
        send("manual", { action: shortcut[1] });
      }
    }
    window.addEventListener("keydown", drive);
    return () => window.removeEventListener("keydown", drive);
  }, [canDriveManually, send]);

  if (!setup.map) return <main className="main live-ds">
    <div className="col">
      <Panel title="Robot Control"><p className="live-detail">Gazebo is disconnected in offline mode.</p></Panel>
      <NavigationRuns lastRunId={snapshot.last_navigation_id} />
    </div>
  </main>;
  const { mode, pose, prediction, command, reason, traveled, trail, range_max, goal_distance, goal_angle } = snapshot;
  const sectors = Sim.SECTORS.map(({ key, label }) => ({
    key, label,
    a0: setup.sector_angles[key] - setup.half_width,
    a1: setup.sector_angles[key] + setup.half_width,
  }));
  const pointOnMap = ([x, y]) => ({ x: x - setup.map.min_x, y: y - setup.map.min_y });
  const mapState = pose && {
    ...pointOnMap([pose.x, pose.y]),
    heading: pose.heading,
    trail: trail.map(pointOnMap),
    sectors: snapshot.sectors,
  };
  const goal = destination && { ...pointOnMap([destination.x, destination.y]), radius: destination.radius };
  async function setGoal(x, y) {
    if (await send("set_goal", { x, y })) setPicking(false);
  }
  function pickGoal(x, y) {
    setGoal(Number((x + setup.map.min_x).toFixed(2)), Number((y + setup.map.min_y).toFixed(2)));
  }
  const telemetry = [
    ["X", pose?.x, "m"], ["Y", pose?.y, "m"],
    ["Linear velocity", pose?.v, "m/s"], ["Angular velocity", pose?.w, "rad/s"],
    ["Heading", pose && pose.heading * 180 / Math.PI, "°"], ["Traveled", traveled, "m"],
  ];
  return (
    <main className="main live-main">
      <div className="col">
        <Panel title="Robot Control" note={setup.adapter}>
          <div className="live-actions">
            <button className="btn primary" disabled={!canDrive || !idle || picking || atGoal} onClick={() => send("start_manual")}>
              <IconPlay /> Start manual
            </button>
            <button className="btn" disabled={!canDrive || !idle || picking || atGoal} onClick={() => send("start")}>
              <IconPlay /> Start autonomous
            </button>
            <button className="btn danger" disabled={pending || idle} onClick={() => send("stop")}>
              <IconStop /> End run
            </button>
          </div>
          <p className="live-detail">Model for autonomous runs · {snapshot.active_model_label}
            {" · "}{snapshot.active_run === "reference" ? "Reference" : snapshot.active_run}</p>
          <div className="live-actions live-manual" aria-label="Manual controls">
            {LIVE_MANUAL_COMMANDS.map(([key, action, label]) => (
              <button key={action} className="btn" aria-keyshortcuts={key.toUpperCase()} disabled={!canDriveManually}
                onClick={() => send("manual", { action })}>{label}</button>
            ))}
          </div>
          <p className="live-detail">In a manual run, use W/A/D to drive and S to record STOP. The run ends at the goal or when you select End run.</p>
          <p className="live-detail" role="status">{reason}</p>
        </Panel>
        {goal && <Panel title="Goal" note={`Radius ${destination.radius} m`}>
          <dl className="live-action-values">
            <div><dt>Distance</dt><dd>{Number.isFinite(goal_distance) ? `${goal_distance.toFixed(2)} m` : "—"}</dd></div>
            <div><dt>Heading error</dt><dd>{Number.isFinite(goal_angle) ? `${(goal_angle * 180 / Math.PI).toFixed(1)}°` : "—"}</dd></div>
          </dl>
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
          <dl className="live-action-values">
            <div><dt>Last prediction</dt><dd>{prediction?.toUpperCase() || "—"}</dd></div>
            <div><dt>Command sent</dt><dd>{command.toUpperCase()}</dd></div>
          </dl>
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
        {mapState ? <MapPanel state={mapState} world={setup.map} obstacles={setup.map.obstacles}
          start={null} goal={goal} sectors={sectors} markerScale={0.26} title="Gazebo Arena — Top View" label="Gazebo map"
          onPickGoal={picking && canDrive && idle ? pickGoal : undefined} />
          : <Panel title="Gazebo Arena">Waiting for odometry</Panel>}
      </div>
      <div className="col">
        {range_max ? <RadarPanel state={snapshot} sectors={sectors} maxRange={range_max} />
          : <Panel title="LiDAR">Waiting for a scan</Panel>}
        <NavigationRuns key={snapshot.session_id} sessionId={snapshot.session_id}
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
  const [theme, setTheme] = React.useState(document.documentElement.dataset.theme || "light");

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
        const status = await liveRequest("/api/status");
        if (active) {
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
      setSnapshot(await liveRequest("/api/control", { command, ...args }));
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setPending(false);
    }
  }, []);

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
  const offline = setup && !setup.map;
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
          <span className={`badge ${connected && snapshot?.ready ? "running" : "standby"}`} role="status">
            <span className="dot"></span>{!connected ? "CONNECTING" : offline ? "OFFLINE DATASETS"
              : snapshot?.resetting ? "RESETTING SIMULATOR" : snapshot?.ready ? "SIMULATOR CONNECTED" : "WAITING FOR SIMULATOR"}
          </span>
          {connected && !offline && !snapshot?.resetting && <StatusBadge
            status={running ? "running" : snapshot?.last_navigation_status || "standby"} running={running} />}
          <div className="controls">
            {setup?.map && <button className="btn" disabled={pending || !snapshot?.reset_available || snapshot?.resetting}
              onClick={() => send("reset")}>Reset session</button>}
            <button className="btn" onClick={toggleTheme}>{theme === "light" ? <IconMoon /> : <IconSun />}{theme === "light" ? "Dark" : "Light"}</button>
            <a className="btn" href="?mock=1">Mockup</a>
          </div>
        </div>
      </header>
      {error && <p className="live-notice" role="alert">{error}</p>}
      {setup && connected && snapshot
        ? view === "operator" ? <LiveRobot setup={setup} snapshot={snapshot} send={send} pending={pending} />
          : <LiveDataScience referenceReport={setup.report} snapshot={snapshot} send={send} pending={pending} />
        : <p className="live-notice">Connecting to the Navigation Monitor service…</p>}
    </div>
  );
}
