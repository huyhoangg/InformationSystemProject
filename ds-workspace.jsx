async function datasetPayload(source, file) {
  if (source.startsWith("archive:")) return { source: "archive", session_id: source.slice("archive:".length) };
  if (source !== "upload") return { source };
  if (!file || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
  if (file.size > 4 * 1024 * 1024) throw new Error("CSV exceeds the 4 MiB limit.");
  return { source, name: file.name, csv: await file.text() };
}

function CaptureTiming({ timing }) {
  if (timing !== "unknown") return null;
  return <p className="live-warning">Capture timing is unknown. Velocities sampled after a command can reveal its action label.</p>;
}

function DatasetPanel({ scenario, packaged, packagedNote, offline, recorded, training, onTrain }) {
  const [source, setSource] = React.useState(packaged ? "packaged" : offline ? "upload" : "manual");
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [savedSessions, setSavedSessions] = React.useState([]);
  const [sessionsError, setSessionsError] = React.useState("");
  const loadPreview = source !== "upload" || file !== null;
  const archiveId = source.startsWith("archive:") && source.slice("archive:".length);
  const query = "?" + new URLSearchParams({ scenario });

  React.useEffect(() => {
    let active = true;
    liveRequest("/api/dataset/sessions" + query)
      .then(({ sessions }) => { if (active) setSavedSessions(sessions); })
      .catch((failure) => { if (active) setSessionsError(failure.message); });
    return () => { active = false; };
  }, [query]);

  React.useEffect(() => {
    let active = true;
    if (loadPreview) {
      datasetPayload(source, file)
        .then((payload) => liveRequest("/api/ds/preview", { ...payload, scenario }, 10000))
        .then((body) => { if (active) setPreview(body); })
        .catch((failure) => { if (active) setError(failure.message); });
    }
    return () => { active = false; };
  }, [source, file, revision, loadPreview, scenario]);

  function clearPreview() {
    setPreview(null);
    setError("");
  }

  async function train() {
    setSubmitting(true);
    setError("");
    try {
      await onTrain(await datasetPayload(source, file));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel title="Labeled Dataset">
      <label className="live-field">
        <span>Dataset source</span>
        <select value={source} onChange={(event) => {
          clearPreview();
          setFile(null);
          setSource(event.target.value);
        }}>
          {packaged && <option value="packaged">Packaged driving data</option>}
          {!offline && <option value="manual">Gazebo · Manual driving session ({recorded} samples)</option>}
          {savedSessions.map((id) => <option key={id} value={"archive:" + id}>Saved driving session · {id}</option>)}
          <option value="upload">Upload a CSV</option>
        </select>
      </label>
      {source === "packaged" && <p className="live-detail">{packagedNote}</p>}
      {sessionsError && <p className="live-error" role="alert">{sessionsError}</p>}
      {source === "upload" && <label className="live-field">
        <span>Driving CSV</span>
        <input type="file" accept=".csv,text/csv" onChange={(event) => {
          clearPreview();
          setFile(event.target.files[0] || null);
        }} />
      </label>}
      {loadPreview && !preview && !error && <p className="live-detail" role="status">Loading preview…</p>}
      {preview && <>
        {preview.total > 0 && <CaptureTiming timing={preview.capture_timing} />}
        <p className="live-detail"><strong>{preview.total}</strong> samples
          {preview.split_strategy === "by_run" && <> · {preview.navigation_run_count} manual runs</>}
          {!preview.error && <> · {preview.train} train · {preview.test} test
            {preview.split_strategy === "temporal_holdout" && <> · {preview.excluded_gap} in temporal gap</>}</>}
        </p>
        {preview.split_strategy === "by_session" && <p className="live-detail">Preview and class counts are from the training session.</p>}
        <ul className="live-label-counts" aria-label="Action counts">
          {Object.entries(preview.counts).map(([label, count]) => <li key={label}>{label} <strong>{count}</strong></li>)}
        </ul>
        {preview.rows.length > 0 && <div className="live-table-scroll">
          <table className="live-table live-samples" aria-label="Dataset preview">
            <thead><tr>{preview.fields.map((field) => <th key={field} scope="col">{field}</th>)}</tr></thead>
            <tbody>{preview.rows.map((row, index) => <tr key={index}>
              {row.map((value, col) => <td key={col}>{sampleValue(value, preview.fields[col])}</td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
      {(error || preview?.error) && <p className="live-error" role="alert">{error || preview.error}</p>}
      <div className="live-actions live-ds-actions">
        <button className="btn primary" disabled={training || submitting || !preview || Boolean(preview.error)}
          onClick={train}>{training || submitting ? "Training…" : "Train models"}</button>
        {source === "manual" && <button className="btn" onClick={() => { clearPreview(); setRevision(revision + 1); }}>
          Refresh preview
        </button>}
        {(source === "packaged" || (source === "manual" && recorded > 0)) && (
          <a className="btn" href={"/api/dataset/" + source + ".csv" + query}>Download CSV</a>
        )}
        {archiveId && <a className="btn" href={"/api/dataset/sessions/" + archiveId + ".csv" + query}>Download CSV</a>}
      </div>
    </Panel>
  );
}

function sampleValue(value, field) {
  if (value === null || (typeof value === "string" && !value.trim())) return "—";
  return field !== "action" && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : value;
}

function scorePercent(value) {
  return (value * 100).toFixed(1) + "%";
}

function ModelEvaluation({ report, selected }) {
  const [mistakes, setMistakes] = React.useState(null);

  async function showMistakes(actual, predicted) {
    const query = new URLSearchParams({ model: selected.id, actual, predicted });
    const cell = { actual, predicted };
    setMistakes(cell);
    try {
      const result = await liveRequest("/api/ds/runs/" + report.id + "/mistakes?" + query);
      setMistakes((current) => current === cell ? { ...cell, result } : current);
    } catch (failure) {
      setMistakes((current) => current === cell ? { ...cell, error: failure.message } : current);
    }
  }

  return <>
    <Panel title="Confusion Matrix" note={selected.label}>
      <div className="live-table-scroll">
        <table className="live-table live-matrix">
          <thead><tr><th scope="col">Actual ↓ / Predicted →</th>
            {selected.labels.map((label) => <th key={label} scope="col">{label}</th>)}
          </tr></thead>
          <tbody>{selected.confusion.map((values, row) => (
            <tr key={selected.labels[row]}><th scope="row">{selected.labels[row]}</th>
              {values.map((count, col) => {
                const actual = selected.labels[row], predicted = selected.labels[col];
                return <td key={predicted} className={row === col ? "diagonal" : count ? "live-mismatch" : ""}>
                  {row !== col && count > 0
                    ? <button className="btn small" aria-label={count + " samples: " + actual + " predicted as " + predicted}
                      aria-pressed={mistakes?.actual === actual && mistakes?.predicted === predicted}
                      onClick={() => showMistakes(actual, predicted)}>{count}</button>
                    : count}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="live-detail">Select an off-diagonal count to inspect the test samples.</p>
    </Panel>
    {mistakes && <Panel title="Misclassified Test Samples" note={mistakes.actual + " → " + mistakes.predicted}>
      {mistakes.error && <p className="live-error" role="alert">{mistakes.error}</p>}
      {!mistakes.result && !mistakes.error && <p className="live-detail" role="status">Loading samples…</p>}
      {mistakes.result && <>
        <p className="live-detail">{mistakes.result.rows.length} of {mistakes.result.total} samples</p>
        <div className="live-table-scroll live-mistakes-scroll">
          <table className="live-table live-samples" aria-label="Misclassified samples">
            <thead><tr><th scope="col">CSV row</th><th scope="col">scan_time</th>
              {mistakes.result.features.map((feature) => <th key={feature} scope="col">{feature}</th>)}
            </tr></thead>
            <tbody>{mistakes.result.rows.map((sample) => <tr key={sample.row}>
              <th scope="row">{sample.row}</th><td>{sampleValue(sample.scan_time, "scan_time")}</td>
              {sample.features.map((value, index) => <td key={index}>{sampleValue(value, "distance")}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </Panel>}
    <Panel title="Per-Class Test Scores" note={selected.label}>
      <div className="live-table-scroll">
        <table className="live-table">
          <thead><tr><th scope="col">Action</th><th scope="col">Precision</th><th scope="col">Recall</th>
            <th scope="col">F1</th><th scope="col">Samples</th></tr></thead>
          <tbody>{selected.labels.map((label) => {
            const scores = selected.per_class[label];
            return <tr key={label}><th scope="row">{label}</th><td>{scorePercent(scores.precision)}</td>
              <td>{scorePercent(scores.recall)}</td><td>{scores["f1-score"].toFixed(3)}</td><td>{scores.support}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </Panel>
  </>;
}

function NavigationComparison({ scenario, lastRunId }) {
  const [cases, setCases] = React.useState([]);
  const [selected, setSelected] = React.useState("0");
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let active = true;
    liveRequest("/api/navigation/comparison?" + new URLSearchParams({ scenario }))
      .then(({ scenarios }) => { if (active) { setCases(scenarios); setError(""); } })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [scenario, lastRunId]);
  const current = cases[Number(selected)] || cases[0];
  const rate = (count, total) => total ? `${scorePercent(count / total)} (${count}/${total})` : "—";
  return <Panel title="Autonomous navigation">
    {error && <p className="live-error" role="alert">{error}</p>}
    {current ? <>
      <label className="live-field">
        <span>Matched start and goal</span>
        <select value={cases[Number(selected)] ? selected : "0"} onChange={(event) => setSelected(event.target.value)}>
          {cases.map(({ origin, goal }, i) => <option key={i} value={i}>
            ({origin[0]}, {origin[1]}, {origin[2]}°) → ({goal[0]}, {goal[1]}) m · r={goal[2]} m
          </option>)}
        </select>
      </label>
      <div className="live-table-scroll"><table className="live-table">
        <thead><tr>{["Model", "Runs", "Reached", "Collision", "Avg time", "Avg distance", "Avg inference"].map(label =>
          <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{current.models.map((item) => <tr key={item.run_id + "/" + item.model + "/" + item.dataset_revision}>
          <th scope="row">{item.model} <small>{item.run_id}
            {item.run_id.startsWith("packaged-") && (" · " + (item.dataset_revision?.slice(0, 8) || "legacy"))}
          </small></th>
          <td>{item.attempts}</td><td>{rate(item.reached, item.attempts)}</td>
          <td>{rate(item.collisions, item.contact_measured)}</td>
          <td>{item.elapsed_s.toFixed(2)} s</td><td>{item.distance_m.toFixed(2)} m</td>
          <td>{item.inference_ms === null ? "—" : item.inference_ms.toFixed(2) + " ms"}</td>
        </tr>)}</tbody>
      </table></div>
    </> : <p className="live-detail">Completed autonomous runs for this map appear here.</p>}
  </Panel>;
}

function ModelArtifacts({ report, model, datasetName, scenario, onImport }) {
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState("");
  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 256 * 1024) { setError("Choose a Decision Tree JSON bundle under 256 KiB."); return; }
    setImporting(true);
    try {
      const run = await liveRequest("/api/ds/models/import", { scenario, name: file.name, content: await file.text() }, 10000);
      onImport(run);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setImporting(false);
    }
  }
  return <Panel title="Model Registry">
    {model?.artifact && <dl className="live-action-values live-registry-meta">
      <div><dt>Artifact</dt><dd>{model.artifact} · {(model.artifact_bytes / 1024).toFixed(1)} KiB</dd></div>
      <div><dt>{report.imported ? "Imported from" : "Dataset source"}</dt><dd>{datasetName || report.id}</dd></div>
      {report.trained_at && <div><dt>Trained at</dt><dd>{new Date(report.trained_at).toLocaleString()}</dd></div>}
      {Number.isFinite(model.fit_seconds) && <div><dt>Fit time</dt><dd>{(model.fit_seconds * 1000).toFixed(1)} ms</dd></div>}
      {report.dataset_revision && <div><dt>Dataset SHA-256</dt><dd>{report.dataset_revision.slice(0, 12)}</dd></div>}
    </dl>}
    {model && Object.keys(model.params || {}).length > 0 && <details className="live-hyperparameters">
      <summary>Hyperparameters</summary>
      <dl>{Object.entries(model.params).map(([name, value]) => <div key={name}>
        <dt>{name}</dt><dd>{String(value)}</dd>
      </div>)}</dl>
    </details>}
    <div className="live-actions live-ds-actions">
      {model?.id === "decision_tree" && <a className="btn" href={`/api/ds/runs/${report.id}/decision-tree.json`}>Download Decision Tree JSON</a>}
      <label className="live-field live-model-upload"><span>{importing ? "Importing model…" : "Upload Decision Tree JSON"}</span>
        <input type="file" accept=".json,application/json" onChange={upload} disabled={importing} />
      </label>
    </div>
    {error && <p className="live-error" role="alert">{error}</p>}
  </Panel>;
}

function LiveRunAnalysis({ snapshot, send, pending }) {
  const [selectedRun, setSelectedRun] = React.useState("");
  const [savedRuns, setSavedRuns] = React.useState([]);
  const [selectedColumns, setSelectedColumns] = React.useState(null);
  const runId = selectedRun || snapshot.navigation?.id || snapshot.last_navigation_id;
  const active = snapshot.mode !== "idle" && runId === snapshot.navigation?.id;
  const { trace, columns, error } = useNavigationTrace(snapshot.scenario, runId, active);
  React.useEffect(() => {
    let current = true;
    liveRequest("/api/navigation/runs?" + new URLSearchParams({ scenario: snapshot.scenario }))
      .then((result) => { if (current) setSavedRuns(result.runs.filter((run) => run.cycle_count > 0)); })
      .catch(() => { if (current) setSavedRuns([]); });
    return () => { current = false; };
  }, [snapshot.scenario, snapshot.last_navigation_id]);
  const fields = selectedColumns || columns;
  const csvLink = new URLSearchParams({ scenario: snapshot.scenario, run: trace?.id || "" });
  fields.forEach((field) => csvLink.append("column", field));
  const size = trace && fields.length > 0 ? fields.join(",").length + 2 + trace.cycle_count * (fields.length + 1)
    + fields.reduce((total, field) => total + (trace.csv_value_sizes[field] || 0), 0) : 0;
  const lastPair = trace?.rows.findLast((row) => row.shadow_action != null);
  return <>
    <Panel title="A/B Model Comparison">
      <dl className="live-action-values">
        <div><dt>Active model A</dt><dd>{snapshot.active_model_label || "—"}</dd></div>
        <div><dt>Shadow model B</dt><dd>{snapshot.shadow?.label || "—"}</dd></div>
      </dl>
      {Number.isFinite(snapshot.inference_ms) && <p className="live-detail">Latest A inference · {snapshot.inference_ms.toFixed(2)} ms</p>}
      {snapshot.shadow && <div className="live-actions live-ds-actions">
        <button className="btn small" disabled={pending} onClick={() => send("clear_shadow")}>Clear Shadow B</button>
      </div>}
      {trace?.compared > 0 ? <p className="live-detail">
        {trace.agreements}/{trace.compared} cycles with matching actions in this run · {trace.compared - trace.agreements} disagreements · Shadow B mean {trace.shadow_mean_ms.toFixed(2)} ms
        {lastPair && <> · last pair {lastPair.model}: {lastPair.model_action.toUpperCase()} / {lastPair.shadow_model}: {lastPair.shadow_action.toUpperCase()}</>}
      </p> : <p className="live-detail">Set Shadow B and start an autonomous run to compare actions on the same sensor input.</p>}
      <p className="live-detail">Expert-labeled cycles · {trace?.expert_scored || 0}. Live accuracy and confusion matrix require expert labels.</p>
    </Panel>
    <Panel title="Dataset & Export">
      <label className="live-field"><span>Navigation run</span>
        <select value={selectedRun} onChange={(event) => setSelectedRun(event.target.value)}>
          <option value="">Current or latest run</option>
          {savedRuns.map((run) => <option key={run.id} value={run.id}>{run.drive_mode} · {run.status} · {run.id}</option>)}
        </select>
      </label>
      {error && <p className="live-error" role="alert">{error}</p>}
      {trace ? <>
        <p className="live-detail">{trace.id} · {trace.cycle_count} cycles · ≈ {(size / 1024).toFixed(1)} KiB</p>
        <details className="live-export-columns">
          <summary>Export columns · {fields.length}/{columns.length}</summary>
          <div className="live-column-options">
            {columns.map((column) => <label key={column}>
              <input type="checkbox" checked={fields.includes(column)} onChange={(event) =>
                setSelectedColumns(event.target.checked ? columns.filter((name) => name === column || fields.includes(name))
                  : fields.filter((name) => name !== column))} />{column}
            </label>)}
          </div>
        </details>
        {fields.includes("expert_action") && <p className="live-detail">The expert_action column is empty for cycles without expert labels.</p>}
        {trace.cycle_count > 0 && fields.length > 0 &&
          <a className="btn" href={"/api/navigation/cycles.csv?" + csvLink}>Export Cycles CSV</a>}
      </> : !error && <p className="live-detail">Run the robot to collect exportable cycles.</p>}
    </Panel>
  </>;
}

function LiveDecisionExplainer({ snapshot }) {
  const [explanation, setExplanation] = React.useState(null);
  const [error, setError] = React.useState("");
  async function explain() {
    setError("");
    try {
      const result = await liveRequest("/api/navigation/explanation?" + new URLSearchParams({ scenario: snapshot.scenario }));
      setExplanation(result.explanation);
      if (!result.explanation) setError("Run an autonomous cycle with a model that contains training reference values.");
    } catch (failure) {
      setError(failure.message);
    }
  }
  return <Panel title="Decision Explainer">
    <button className="btn" onClick={explain} disabled={!Number.isFinite(snapshot.confidence)}>Explain latest prediction</button>
    {error && <p className="live-error" role="alert">{error}</p>}
    {explanation && <>
      <p className="live-detail">Cycle {explanation.cycle} · {explanation.action.toUpperCase()} · {scorePercent(explanation.confidence)}</p>
      <p className="live-detail">Probability change versus replacing one feature with its training median, in percentage points.</p>
      <div className="live-table-scroll"><table className="live-table">
        <thead><tr><th>Feature</th><th>Observed</th><th>Train median</th><th>Change (pp)</th></tr></thead>
        <tbody>{[...explanation.features].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((item) => <tr key={item.name}>
          <th scope="row">{item.name}</th><td>{item.value.toFixed(3)}</td><td>{item.reference.toFixed(3)}</td>
          <td><span className={`live-delta ${item.delta < 0 ? "negative" : "positive"}`}>
            <span>{item.delta >= 0 ? "+" : ""}{(100 * item.delta).toFixed(1)}</span>
            <span className="live-delta-bar" style={{ width: `${Math.abs(item.delta) * 100}%` }} aria-hidden="true" />
          </span></td>
        </tr>)}</tbody>
      </table></div>
      {explanation.rule_path.length > 0 && <p className="live-detail">Decision Tree path · {explanation.rule_path.map((node) =>
        `${node.name} ${node.operator} ${node.threshold.toFixed(3)}`).join(" · ")}</p>}
    </>}
  </Panel>;
}

function LiveDataScience({ packagedReport, packagedNote, offline, snapshot, send, pending }) {
  const [workspace, setWorkspace] = React.useState({ runs: [], job: null });
  const [runId, setRunId] = React.useState(snapshot.active_run ?? packagedReport?.id ?? "");
  const [report, setReport] = React.useState(packagedReport);
  const [modelId, setModelId] = React.useState(snapshot.active_model);
  const [historyError, setHistoryError] = React.useState("");
  const [reportError, setReportError] = React.useState("");
  const trainingId = React.useRef(null);

  React.useEffect(() => {
    let active = true;
    let timer;
    async function refresh() {
      try {
        const state = await liveRequest("/api/ds/runs?" + new URLSearchParams({ scenario: snapshot.scenario }));
        if (active) {
          setWorkspace(state);
          setHistoryError("");
          if (trainingId.current && state.job?.id === trainingId.current && state.job.status !== "running") {
            if (state.job.status === "completed") {
              setReportError("");
              setRunId(state.job.id);
            }
            trainingId.current = null;
          }
        }
      } catch (failure) {
        if (active) setHistoryError(failure.message);
      } finally {
        if (active) timer = setTimeout(refresh, 1000);
      }
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [snapshot.scenario]);

  React.useEffect(() => {
    if (!runId || runId === packagedReport?.id) {
      setReport(packagedReport);
      return;
    }
    let active = true;
    liveRequest("/api/ds/runs/" + runId)
      .then((result) => { if (active) setReport(result); })
      .catch((failure) => { if (active) setReportError(failure.message); });
    return () => { active = false; };
  }, [runId, packagedReport]);

  async function train(payload) {
    const job = await liveRequest("/api/ds/runs", { ...payload, scenario: snapshot.scenario }, 10000);
    trainingId.current = job.id;
    setWorkspace((current) => ({ ...current, job }));
  }

  const { runs, job } = workspace;
  const selected = report?.id === runId ? report.models.find((entry) => entry.id === modelId) || report.models[0] : null;
  const active = runId === snapshot.active_run && selected?.id === snapshot.active_model;

  function viewRun(next) {
    setReportError("");
    setRunId(next);
  }

  return (
    <main className="main live-ds">
      <div className="col">
        <DatasetPanel key={snapshot.session_id} scenario={snapshot.scenario} packaged={!!packagedReport}
          packagedNote={packagedNote} offline={offline} recorded={snapshot.recorded}
          training={job?.status === "running" || snapshot.resetting} onTrain={train} />
        <Panel title="Training Runs">
          <label className="live-field">
            <span>Evaluation run</span>
            <select value={runId} onChange={(event) => viewRun(event.target.value)}>
              {!runId && <option value="">Choose a training run</option>}
              {runId && !runs.some((run) => run.id === runId) && <option value={runId}>{runId}</option>}
              {runs.map((run) => <option key={run.id} value={run.id}>
                {run.dataset}{run.packaged ? " · pre-trained" : run.imported ? " · imported" : " · " + run.id}
              </option>)}
            </select>
          </label>
          {historyError && <p className="live-error" role="alert">{historyError}</p>}
          {job?.status === "running" && <p className="live-detail" role="status">Training on {job.dataset}…</p>}
          {job?.status === "failed" && <p className="live-error" role="alert">{job.error}</p>}
          {job?.status === "completed" && <p className="live-detail" role="status">Training complete · {job.id}
            {runId !== job.id && <> <button className="btn small" onClick={() => viewRun(job.id)}>View results</button></>}
          </p>}
          {reportError && <p className="live-error" role="alert">{reportError}</p>}
          {!selected && !reportError && <p className="live-detail" role="status">
            {runId ? "Loading run…" : "Train a model or select a saved run."}
          </p>}
          {selected && !report.imported && <>
            <p className="live-detail">{report.train} train · {report.test} test
              {report.split_strategy === "temporal_holdout" && <> · {report.excluded_gap} in temporal gap</>}</p>
            <p className="live-detail">{report.split_strategy === "by_session" ? "Independent test session"
              : report.split_strategy === "by_run" ? "Whole runs held out for testing" : "Single-session temporal holdout"}
              {" · "}{report.features.length} features · {selected.labels.length} actions.</p>
            <CaptureTiming timing={report.capture_timing} />
            <div className="live-actions live-ds-actions">
              <a className="btn" href={"/api/ds/runs/" + runId + "/dataset.csv"}>{report.test_session_id ? "Download train CSV" : "Download run CSV"}</a>
              {report.test_session_id && <a className="btn" href={"/api/ds/runs/" + runId + "/test_dataset.csv"}>Download test CSV</a>}
            </div>
          </>}
        </Panel>
        <ModelArtifacts report={report?.id === runId ? report : null} model={selected} scenario={snapshot.scenario}
          datasetName={runs.find((run) => run.id === runId)?.dataset} onImport={(run) => {
            setWorkspace((current) => ({ ...current, runs: [run, ...current.runs] }));
            setModelId("decision_tree");
            viewRun(run.id);
          }} />
        {!offline && <LiveRunAnalysis snapshot={snapshot} send={send} pending={pending} />}
      </div>
      <div className="col">
        {selected && <Panel title="Model Comparison" note={report.imported ? "IMPORTED ARTIFACT" : "OFFLINE TEST SET"}>
          {report.imported ? <p className="live-detail">Decision Tree · Evaluation scores unavailable for this imported artifact.</p>
            : <div className="live-table-scroll">
            <table className="live-table">
              <thead><tr><th scope="col">Model</th><th scope="col">Accuracy</th><th scope="col">Macro-F1</th>
                <th scope="col">Precision</th><th scope="col">Recall</th></tr></thead>
              <tbody>{report.models.map((model) => (
                <tr key={model.id} className={selected.id === model.id ? "selected" : ""}>
                  <th scope="row"><button className="btn small" aria-pressed={selected.id === model.id}
                    onClick={() => setModelId(model.id)}>{model.label}</button>
                    {runId === snapshot.active_run && model.id === snapshot.active_model &&
                      <span className="live-active">Active</span>}
                  </th>
                  <td>{scorePercent(model.accuracy)}</td><td>{model.macro_f1.toFixed(3)}</td>
                  <td>{scorePercent(model.precision)}</td><td>{scorePercent(model.recall)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {selected.deployable && <div className="live-actions">
            <button className="btn primary" disabled={pending || snapshot.resetting || snapshot.mode === "manual" || active}
              onClick={() => send("model", { model: selected.id, run_id: runId, hot_swap: snapshot.mode === "auto" })}>
              {active ? "Active model" : snapshot.mode === "auto" ? "Deploy " + selected.label + " mid-run" : "Use " + selected.label}
            </button>
            {!offline && <button className="btn" disabled={pending || snapshot.resetting ||
              (snapshot.shadow?.model === selected.id && snapshot.shadow.run_id === runId)}
              onClick={() => send("shadow", { model: selected.id, run_id: runId })}>Set as Shadow B</button>}
          </div>}
        </Panel>}
        {selected && !report.imported && <ModelEvaluation key={runId + "/" + selected.id} report={report} selected={selected} />}
        {!offline && <LiveDecisionExplainer key={snapshot.navigation?.id} snapshot={snapshot} />}
        {!offline && <NavigationComparison scenario={snapshot.scenario} lastRunId={snapshot.last_navigation_id} />}
      </div>
    </main>
  );
}
