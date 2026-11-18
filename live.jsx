async function liveRequest(path, payload) {
  const request = { signal: AbortSignal.timeout(2500) };
  if (payload) {
    request.method = "POST";
    request.headers = { "Content-Type": "application/json" };
    request.body = JSON.stringify(payload);
  }
  const response = await fetch(path, request);
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("ROS web service unavailable");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function LiveRobot({ setup, snapshot, send, pending }) {
  const { mode, ready, pose, prediction, command, reason, traveled, trail, range_max } = snapshot;
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
  const canDrive = ready && !pending;
  const telemetry = [
    ["X", pose?.x, "m"], ["Y", pose?.y, "m"],
    ["Linear velocity", pose?.v, "m/s"], ["Angular velocity", pose?.w, "rad/s"],
    ["Heading", pose && pose.heading * 180 / Math.PI, "°"], ["Traveled", traveled, "m"],
  ];
  return (
    <main className="main live-main">
      <div className="col">
        <Panel title="Robot Control" note="ROS 2">
          <div className="live-actions">
            <button className="btn primary" disabled={!canDrive || mode !== "idle"} onClick={() => send("start")}>
              <IconPlay /> Start autonomous
            </button>
            <button className="btn danger" disabled={pending || mode === "idle"} onClick={() => send("stop")}>
              <IconStop /> Stop
            </button>
          </div>
          <div className="live-actions live-manual" aria-label="Manual controls">
            {[['left', 'Left'], ['forward', 'Forward'], ['right', 'Right']].map(([action, label]) => (
              <button key={action} className="btn" disabled={!canDrive || mode === "auto"}
                onClick={() => send("manual", { action })}>{label}</button>
            ))}
          </div>
          <p className="live-detail">Manual commands record LiDAR and the selected action to CSV.</p>
          <p className="live-detail" role="status">{reason}</p>
        </Panel>
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
          start={null} goal={null} sectors={sectors} markerScale={0.52} title="Gazebo Arena — Top View" label="Gazebo map" />
          : <Panel title="Gazebo Arena">Waiting for odometry</Panel>}
      </div>
      <div className="col">
        {range_max ? <RadarPanel state={snapshot} sectors={sectors} maxRange={range_max} />
          : <Panel title="LiDAR">Waiting for a scan</Panel>}
      </div>
    </main>
  );
}

function LiveDataScience({ report, snapshot, send, pending }) {
  const [selectedId, setSelectedId] = React.useState(snapshot.active_model);
  const selected = report.models.find((model) => model.id === selectedId) || report.models[0];
  return (
    <main className="main live-ds">
      <div className="col">
        <Panel title="Model Comparison" note="OFFLINE TEST SET">
          <div className="live-table-scroll">
            <table className="live-table">
              <thead><tr><th>Model</th><th>Accuracy</th><th>Macro-F1</th></tr></thead>
              <tbody>{report.models.map((model) => (
                <tr key={model.id} className={selected.id === model.id ? "selected" : ""}>
                  <th scope="row"><button className="btn small" aria-pressed={selected.id === model.id} onClick={() => setSelectedId(model.id)}>
                    {model.label}</button>{model.id === snapshot.active_model && <span className="live-active">Active</span>}</th>
                  <td>{(model.accuracy * 100).toFixed(1)}%</td>
                  <td>{model.macro_f1.toFixed(3)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {selected.id !== "baseline" && <div className="live-actions">
            <button className="btn primary" disabled={pending || snapshot.mode !== "idle" || selected.id === snapshot.active_model}
              onClick={() => send("model", { model: selected.id })}>
              {selected.id === snapshot.active_model ? "Active model" : `Use ${selected.label}`}
            </button>
          </div>}
        </Panel>
        <Panel title="Labeled Datasets">
          <p className="live-detail">Reference driving session · {report.total} samples · {report.train} train · {report.test} test</p>
          <p className="live-detail">Gazebo manual session · {snapshot.recorded} samples</p>
          <div className="live-actions">
            <a className="btn" href="/api/dataset/reference.csv">Download reference CSV</a>
            {snapshot.recorded > 0 && <a className="btn" href="/api/dataset/manual.csv">Download manual CSV</a>}
          </div>
        </Panel>
      </div>
      <div className="col">
        <Panel title="Confusion Matrix" note={selected.label}>
          <div className="live-table-scroll">
            <table className="live-table live-matrix">
              <thead><tr><th>Actual ↓ / Predicted →</th>{selected.labels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{selected.confusion.map((values, row) => (
                <tr key={selected.labels[row]}><th scope="row">{selected.labels[row]}</th>
                  {values.map((value, col) => <td key={col} className={row === col ? "diagonal" : ""}>{value}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
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

  const send = async (command, args) => {
    setPending(true);
    setError("");
    try {
      await liveRequest("/api/control", { command, ...args });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  };

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
  const model = setup?.report.models.find((entry) => entry.id === snapshot?.active_model);
  const running = snapshot?.mode !== "idle";
  return (
    <div className="app live-app">
      <header className="topbar">
        <div className="title-block">
          <h1>NAVIGATION MONITOR</h1>
          <span className="title-meta">ROS 2 · Gazebo <strong>{model ? `· ${model.label}` : ""}</strong></span>
        </div>
        <div className="view-tabs" aria-label="Monitor views">
          <button className={view === "operator" ? "active" : ""} onClick={() => chooseView("operator")}>Operator View</button>
          <button className={view === "ds" ? "active" : ""} onClick={() => chooseView("ds")}>DS Workspace</button>
        </div>
        <div className="topbar-spacer"></div>
        <div className="top-right">
          <span className={`badge ${connected && snapshot?.ready ? "running" : "standby"}`} role="status">
            <span className="dot"></span>{!connected ? "CONNECTING" : !snapshot?.ready ? "WAITING FOR ROS" : "LIVE ROS 2"}
          </span>
          {connected && <StatusBadge status={running ? "running" : "standby"} running={running} />}
          <div className="controls">
            <button className="btn" onClick={toggleTheme}>{theme === "light" ? <IconMoon /> : <IconSun />}{theme === "light" ? "Dark" : "Light"}</button>
            <a className="btn" href="?mock=1">Mockup</a>
          </div>
        </div>
      </header>
      {error && <p className="live-notice" role="alert">{error}</p>}
      {setup && connected && snapshot
        ? view === "operator" ? <LiveRobot setup={setup} snapshot={snapshot} send={send} pending={pending} />
          : <LiveDataScience report={setup.report} snapshot={snapshot} send={send} pending={pending} />
        : <p className="live-notice">Connecting to the ROS web service…</p>}
    </div>
  );
}
