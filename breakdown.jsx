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
        <span>Trang 0{n} / 0{total}</span>
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
  ["Action Hero (Dual Mode)", "Nhãn hành động: phím bấm thủ công khi thu thập data (W/A/S/D) hoặc dự đoán từ ML model — v2: hiển thị thêm confidence % của dự đoán", "FR-04 · FR-05 · FR-12 · FR-17"],
  ["Robot Telemetry", "Vận tốc dài v (m/s), vận tốc góc w (rad/s), góc lệch goal_angle (°), quãng đường tích lũy", "FR-02 · FR-15"],
  ["Distance to Goal", "Khoảng cách Euclidean tới tọa độ đích (m) và thanh % tiến độ hoàn thành", "FR-17"],
  ["Warehouse Map", "Vị trí robot (x, y), heading, vị trí goal, bản đồ chướng ngại vật và vết di chuyển", "FR-01 · FR-02"],
  ["LiDAR Radar", "5 khoảng cách tối thiểu: Front, Front-Left, Left, Front-Right, Right (ngưỡng 0.6m / 1.4m)", "FR-03"],
  ["Navigation Cycle Log", "Bản ghi telemetry chu kỳ 5 Hz (cycle id, timestamp, action, khoảng cách) & sự kiện", "FR-14 · FR-15 · FR-17"],
  ["Operator Console", "Nhận lệnh tương tác: start, pause, resume, terminate, restart, speed, goal <x> <y>, model use <id>", "UC-07 · UC-09"],
];

function App() {
  return (
    <div>
      <Sheet n={1} total={TOTAL} title="Mockup Design Spec" className="cover">
        <div className="cover-kicker micro">UI Mockup · Giao diện giám sát thí nghiệm · Intelligent Systems (HCMUT)</div>
        <h1>NAVIGATION<br />MONITOR</h1>
        <div className="cover-meta">
          <div className="cm-item">
            <span className="micro">Môn học</span>
            <span className="cm-val">Hệ thống thông minh — Intelligent Systems</span>
          </div>
          <div className="cm-item">
            <span className="micro">Giảng viên hướng dẫn</span>
            <span className="cm-val">PGS. TS. Quản Thành Thơ</span>
          </div>
          <div className="cm-item">
            <span className="micro">Nhóm thực hiện</span>
            <span className="cm-val">Phạm Xuân Hiển · Nguyễn Thành Đạt · Nguyễn Huy Hoàng</span>
          </div>
        </div>
        <div className="toc">
          <div className="toc-row"><span className="toc-num">02</span><span>Tổng quan bố cục dashboard</span><span className="toc-page">overview</span></div>
          <div className="toc-row"><span className="toc-num">03</span><span>Các trạng thái thí nghiệm</span><span className="toc-page">states</span></div>
          <div className="toc-row"><span className="toc-num">04</span><span>Component chi tiết — Action, Telemetry, Goal, Controls</span><span className="toc-page">components I</span></div>
          <div className="toc-row"><span className="toc-num">05</span><span>Component chi tiết — Bản đồ kho &amp; LiDAR radar</span><span className="toc-page">components II</span></div>
          <div className="toc-row"><span className="toc-num">06</span><span>Cycle Log, Operator Console &amp; bảng nguồn dữ liệu</span><span className="toc-page">console &amp; data flow</span></div>
          <div className="toc-row"><span className="toc-num">07</span><span>DS Workspace — Model Registry &amp; A/B Comparison</span><span className="toc-page">ds workspace I</span></div>
          <div className="toc-row"><span className="toc-num">08</span><span>DS Workspace — Chất lượng dự đoán &amp; Confusion Matrix</span><span className="toc-page">ds workspace II</span></div>
          <div className="toc-row"><span className="toc-num">09</span><span>DS Workspace — Decision Explainer &amp; Dataset Export</span><span className="toc-page">ds workspace III</span></div>
        </div>
      </Sheet>

      <Sheet n={2} total={TOTAL} title="02 · Tổng quan bố cục">
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
          <span className="ov-chip"><b>+</b> tab DS Workspace — trang 07–09</span>
        </div>
      </Sheet>

      <Sheet n={3} total={TOTAL} title="03 · Các trạng thái thí nghiệm (FR-17)">
        <div className="state-rows">
          <div className="state-row">
            <StatusBadge status="standby" running={false} />
            <span className="state-desc"><b>STANDBY</b> — mô phỏng sẵn sàng, chưa bắt đầu thí nghiệm. Operator xác nhận destination rồi bấm Start (hoặc lệnh <b>start</b> trên console).</span>
          </div>
          <div className="state-row">
            <StatusBadge status="running" running={true} />
            <span className="state-desc"><b>RUNNING</b> — đang điều hướng tự lập. Badge nhấp nháy, toàn bộ panel cập nhật theo từng chu kỳ 5 Hz: action dự đoán, khoảng cách đích, LiDAR, vị trí trên bản đồ.</span>
          </div>
          <div className="state-row">
            <StatusBadge status="running" running={false} />
            <span className="state-desc"><b>PAUSED</b> — operator tạm dừng quan sát; trạng thái thí nghiệm giữ nguyên, tiếp tục bằng Resume. Dừng quan sát không kết thúc thí nghiệm (UC-09).</span>
          </div>
          <div className="state-row">
            <StatusBadge status="reached" running={false} />
            <span className="state-desc"><b>DESTINATION REACHED</b> — robot đã tới đích. Thanh tổng kết hiện elapsed, quãng đường và số chu kỳ; trạng thái cuối được giữ lại sau khi thí nghiệm kết thúc.</span>
          </div>
          <div className="state-row">
            <StatusBadge status="terminated" running={false} />
            <span className="state-desc"><b>TERMINATED</b> — thí nghiệm bị dừng: do operator, <b>va chạm vật cản</b> (FR-15) hoặc vượt thời gian. Lý do được ghi rõ trên endbar và trong Cycle Log.</span>
          </div>
        </div>
        <div className="state-flow">
          <span className="sf-node">STANDBY</span>
          <span className="sf-arrow">→ start →</span>
          <span className="sf-node n-run">RUNNING</span>
          <span className="sf-arrow">→ tới đích →</span>
          <span className="sf-node n-done">REACHED</span>
          <span className="sf-arrow" style={{ marginLeft: "6mm" }}>hoặc</span>
          <span className="sf-node n-term">TERMINATED</span>
          <span className="sf-arrow">← va chạm / operator / timeout</span>
        </div>
      </Sheet>

      <Sheet n={4} total={TOTAL} title="04 · Component chi tiết I">
        <div className="fig-grid">
          <Figure
            name="Action Hero (Dual Mode: Predict / Manual)"
            tag="FR-04 · FR-05 · FR-12 · FR-17"
            desc="Dùng chung linh hoạt: (1) Thu thập data (UC-02): hiển thị phím điều khiển thủ công W/A/S/D của Robotics Engineer để đối soát nhãn gán cho vector cảm biến; (2) Tự hành (UC-07): hiển thị hành động do model ML dự đoán ở chu kỳ 5 Hz — chữ lớn 42px, màu và icon riêng từng class."
          >
            <ActionHero state={RUNNING} />
          </Figure>
          <Figure
            name="Robot Telemetry"
            tag="FR-02 · FR-15"
            desc="Tốc độ dài (m/s), tốc độ góc (rad/s), góc lệch so với hướng đích (độ, kèm bên L/R) và tổng quãng đường đã đi — 4 ô số mono tabular, cập nhật mỗi chu kỳ."
          >
            <Panel title="Robot Telemetry" label="Robot telemetry">
              <TelemetryGrid state={RUNNING} />
            </Panel>
          </Figure>
          <Figure
            name="Distance to Goal"
            tag="FR-17"
            desc="Khoảng cách còn lại tới destination dạng số lớn + thanh tiến độ theo % khoảng cách ban đầu; hiển thị tọa độ đích để operator đối chiếu lúc đặt goal."
          >
            <GoalPanel state={RUNNING} />
          </Figure>
          <Figure
            name="Status Badge & Operator Controls"
            tag="UC-07 · FR-17"
            desc="Badge trạng thái (nhấp nháy khi RUNNING) + đồng hồ elapsed; cụm nút điều khiển: tốc độ mô phỏng 1×/4×/16×, Start/Pause/Resume, Terminate (viền đỏ) và Restart."
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

      <Sheet n={5} total={TOTAL} title="05 · Component chi tiết II">
        <div className="two-col">
          <Figure
            name="Warehouse — Top View"
            tag="FR-01 · FR-02"
            desc="Mặt bằng kho 20 × 14 m nhìn từ trên: lưới 1 m, kệ hàng (khối xám), đích (vòng xanh GOAL), điểm xuất phát, vệt đường robot đã đi và 5 tia LiDAR đổi màu theo khoảng cách — robot hình tam giác quay theo hướng heading."
            bodyStyle={{ minHeight: "120mm" }}
          >
            <MapPanel state={RUNNING} />
          </Figure>
          <Figure
            name="LiDAR — Directional Min Distance"
            tag="FR-03"
            desc="Quạt radar 240° thể hiện 5 vùng quét theo spec: front ±15°, front-left 15–60°, left 60–120°, front-right −60…−15°, right −120…−60°. Bán kính quạt = khoảng cách nhỏ nhất của vùng (tối đa 4 m); màu cảnh báo: xanh dương an toàn &gt; 1.4 m, vàng 0.6–1.4 m, đỏ nguy hiểm &lt; 0.6 m. Bên dưới là bảng số liệu + thanh bar từng vùng."
          >
            <RadarPanel state={RUNNING} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={6} total={TOTAL} title="06 · Console, Cycle Log & nguồn dữ liệu">
        <div className="two-col" style={{ minHeight: "68mm", flex: 1 }}>
          <Figure
            name="Operator Console"
            tag="UC-07"
            desc="Terminal cho System Operator gửi lệnh bằng text: start / pause / resume / terminate / restart, speed <1|4|16>, goal <x> <y> (đặt lại destination ngay khi đang chạy), status, clear. Có history phím ↑/↓; mọi lệnh đổi trạng thái đều được ghi vào Cycle Log để truy vết."
          >
            <Terminal lines={SAMPLE_TERM} onCommand={() => {}} />
          </Figure>
          <Figure
            name="Navigation Cycle Log"
            tag="FR-14 · FR-15 · FR-17"
            desc="Log từng chu kỳ cảm nhận–dự đoán–hành động (mã cycle, thời gian, action, khoảng cách front/goal); các sự kiện (start, đặt đích, pause, reached, collision) nổi bật dạng dòng EVENT — phục vụ truy vết và viết báo cáo."
          >
            <CycleLog entries={SAMPLE_LOG} />
          </Figure>
        </div>
        <div className="dash-flow-note">
          <table className="df">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Component / vùng UI</th>
                <th>Dữ liệu hiển thị — nguồn ROS 2</th>
                <th style={{ width: "17%" }}>Yêu cầu</th>
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
            desc="Bổ sung sau review (W1) — không gian quản lý mô hình cho Data Scientist: bảng 4 thuật toán (KNN, GNB, DT, RF) kèm artifact .pkl, validation accuracy, F1, thời gian suy luận; khối chi tiết hyperparameters, thời gian huấn luyện, dataset nguồn. Ba thao tác: Activate & Deploy (đưa model vào pipeline ngay cả khi đang chạy — hot-swap), Set as Shadow B (chọn ứng viên so sánh) và Upload model (.pkl/.joblib/.onnx) thêm vào registry chờ kiểm định."
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
            desc="Bổ sung sau review (W3) — so sánh trực tiếp hai mô hình trên cùng chu kỳ: thẻ A (đang triển khai) và B (shadow) hiển thị accuracy live tính trên nhãn tham chiếu chuyên gia, thẻ thắng viền xanh. Bảng dưới tổng hợp lịch sử navigation-level từng model từ các phiên trước: số lượt chạy, success rate, collision rate, thời gian và quãng đường trung bình."
          >
            <ABComparePanel models={Sim.MODELS} deployedId="rf_v14" shadowId="dt_v12" ds={SAMPLE_DS} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={8} total={TOTAL} title="08 · DS Workspace — Chất lượng dự đoán & Confusion Matrix">
        <div className="two-col">
          <Figure
            name="Prediction Quality — Live"
            tag="FR-09 · FR-12 · UC-08"
            desc="Bổ sung sau review (W2) — bốn chỉ số trực tiếp: live accuracy trên nhãn tham chiếu chuyên gia, confidence của chu kỳ hiện tại, số mismatch, số chu kỳ đã ghi; đồ thị rolling accuracy 200 chu kỳ; bảng mismatch review liệt kê các chu kỳ model dự đoán lệch expert kèm ngữ cảnh (khoảng cách front, góc lệch đích) để DS trích xuất và phân tích lỗi sau thí nghiệm."
          >
            <PredictionQualityPanel state={RUNNING} ds={SAMPLE_DS} deployed={Sim.MODELS[0]} />
          </Figure>
          <Figure
            name="Confusion Matrix — Model vs Expert"
            tag="FR-09"
            desc="Bổ sung sau review (W2) — ma trận nhầm lẫn real-time giữa hành động tham chiếu chuyên gia (hàng) và hành động model dự đoán (cột): ô chéo xanh đậm dần theo tần suất, ô dự đoán lệch nền đỏ; hàng cuối là recall từng lớp, dòng dưới tổng hợp % agreement. Số liệu làm đầy theo từng chu kỳ 5 Hz trong lúc thí nghiệm chạy."
          >
            <ConfusionMatrixPanel ds={SAMPLE_DS} />
          </Figure>
        </div>
      </Sheet>

      <Sheet n={9} total={TOTAL} title="09 · DS Workspace — Decision Explainer & Dataset Export">
        <div className="two-col">
          <Figure
            name="Decision Explainer (XAI)"
            tag="FR-12 · mở rộng"
            desc="Bổ sung sau review (W4) — giải thích quyết định theo feature attribution: thanh signed thể hiện yếu tố ủng hộ (xanh) / đẩy ngược (đỏ) quyết định, % trọng số từng yếu tố, yếu tố ảnh hưởng nhất được làm đậm; khối rule trace diễn giải bằng chính ngưỡng của bài toán (front < 0.75 m, |goal angle| > 31.5°) — cho biết vùng LiDAR nào bị vướng hay góc lệch nào đang tác động lớn nhất khiến model rẽ/dừng, hỗ trợ tinh chỉnh thuật toán."
          >
            <DecisionExplainerPanel state={RUNNING} />
          </Figure>
          <Figure
            name="Dataset & Export"
            tag="FR-06 · UC-02"
            desc="Bổ sung sau review (W3) — luồng xuất dữ liệu tái huấn luyện: run id, số chu kỳ thu thập, số nhãn lệch (model ≠ expert), dung lượng ước tính; chip bật/tắt từng cột xuất (5 vùng LiDAR, goal_dist, goal_angle, action, expert, confidence, v, w); nút Export CSV tải file thật về máy — nhãn gồm cả hành động tham chiếu expert để DS gán lại nhãn trước khi huấn luyện lại."
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
