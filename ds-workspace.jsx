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

function DatasetPanel({ recorded, training, onTrain }) {
  const [source, setSource] = React.useState("reference");
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [savedSessions, setSavedSessions] = React.useState([]);
  const [sessionsError, setSessionsError] = React.useState("");
  const loadPreview = source !== "upload" || file !== null;
  const archiveId = source.startsWith("archive:") && source.slice("archive:".length);

  React.useEffect(() => {
    let active = true;
    liveRequest("/api/dataset/sessions")
      .then(({ sessions }) => { if (active) setSavedSessions(sessions); })
      .catch((failure) => { if (active) setSessionsError(failure.message); });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    let active = true;
    if (loadPreview) {
      datasetPayload(source, file)
        .then((payload) => liveRequest("/api/ds/preview", payload, 10000))
        .then((body) => { if (active) setPreview(body); })
        .catch((failure) => { if (active) setError(failure.message); });
    }
    return () => { active = false; };
  }, [source, file, revision, loadPreview]);

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
          <option value="reference">Hiển · Reference driving session</option>
          <option value="manual">Gazebo · Manual driving session ({recorded} samples)</option>
          {savedSessions.map((id) => <option key={id} value={"archive:" + id}>Saved driving session · {id}</option>)}
          <option value="upload">Upload a CSV</option>
        </select>
      </label>
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
            {preview.split_strategy !== "by_run" && <> · {preview.excluded_gap} in temporal gap</>}</>}
        </p>
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
        {(source === "reference" || (source === "manual" && recorded > 0)) && (
          <a className="btn" href={"/api/dataset/" + source + ".csv"}>Download CSV</a>
        )}
        {archiveId && <a className="btn" href={"/api/dataset/sessions/" + archiveId + ".csv"}>Download CSV</a>}
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

function LiveDataScience({ referenceReport, snapshot, send, pending }) {
  const [workspace, setWorkspace] = React.useState({ runs: [], job: null });
  const [runId, setRunId] = React.useState(snapshot.active_run);
  const [report, setReport] = React.useState(referenceReport);
  const [modelId, setModelId] = React.useState(snapshot.active_model);
  const [historyError, setHistoryError] = React.useState("");
  const [reportError, setReportError] = React.useState("");
  const trainingId = React.useRef(null);

  React.useEffect(() => {
    let active = true;
    let timer;
    async function refresh() {
      try {
        const state = await liveRequest("/api/ds/runs");
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
  }, []);

  React.useEffect(() => {
    if (runId === referenceReport.id) {
      setReport(referenceReport);
      return;
    }
    let active = true;
    liveRequest("/api/ds/runs/" + runId)
      .then((result) => { if (active) setReport(result); })
      .catch((failure) => { if (active) setReportError(failure.message); });
    return () => { active = false; };
  }, [runId, referenceReport]);

  async function train(payload) {
    const job = await liveRequest("/api/ds/runs", payload, 10000);
    trainingId.current = job.id;
    setWorkspace((current) => ({ ...current, job }));
  }

  const { runs, job } = workspace;
  const selected = report.id === runId ? report.models.find((entry) => entry.id === modelId) || report.models[0] : null;
  const active = runId === snapshot.active_run && selected?.id === snapshot.active_model;

  function viewRun(next) {
    setReportError("");
    setRunId(next);
  }

  return (
    <main className="main live-ds">
      <div className="col">
        <DatasetPanel key={snapshot.session_id} recorded={snapshot.recorded}
          training={job?.status === "running" || snapshot.resetting} onTrain={train} />
        <Panel title="Training Runs">
          <label className="live-field">
            <span>Evaluation run</span>
            <select value={runId} onChange={(event) => viewRun(event.target.value)}>
              {!runs.some((run) => run.id === runId) && <option value={runId}>{runId}</option>}
              {runs.map((run) => <option key={run.id} value={run.id}>
                {run.dataset}{run.id === "reference" ? " · pre-trained" : " · " + run.id}
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
          {!selected && !reportError && <p className="live-detail" role="status">Loading run…</p>}
          {selected && <>
            <p className="live-detail">{report.train} train · {report.test} test
              {report.split_strategy !== "by_run" && <> · {report.excluded_gap} in temporal gap</>}</p>
            <p className="live-detail">{report.split_strategy === "by_run" ? "Whole runs held out for testing" : "Single-session temporal holdout"}
              {" · "}{report.features.length} features · {selected.labels.length} actions.</p>
            <CaptureTiming timing={report.capture_timing} />
            <div className="live-actions live-ds-actions">
              <a className="btn" href={"/api/ds/runs/" + runId + "/dataset.csv"}>Download run CSV</a>
            </div>
          </>}
        </Panel>
      </div>
      <div className="col">
        {selected && <Panel title="Model Comparison" note="OFFLINE TEST SET">
          <div className="live-table-scroll">
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
          </div>
          {selected.deployable && <div className="live-actions">
            <button className="btn primary" disabled={pending || snapshot.resetting || snapshot.mode !== "idle" || active}
              onClick={() => send("model", { model: selected.id, run_id: runId })}>
              {active ? "Active model" : "Use " + selected.label}
            </button>
            {snapshot.mode !== "idle" && <p className="live-detail">Stop the robot to switch models.</p>}
          </div>}
        </Panel>}
        {selected && <ModelEvaluation key={runId + "/" + selected.id} report={report} selected={selected} />}
      </div>
    </main>
  );
}
