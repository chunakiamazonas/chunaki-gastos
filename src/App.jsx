import { useState } from "react";

const ACTIVITIES = [
  { name: "Caminata en la selva Chunaki (día o noche)", gallons: 0 },
  { name: "Caminata en la selva Vista Alegre", gallons: 7 },
  { name: "Santuario de micos: Maikuchiga", gallons: 7 },
  { name: "Aventura de campamento en la selva", gallons: 7 },
  { name: "Avistamiento de perezosos y Victoria Regia: San Antonio + baño en lago", gallons: 14 },
  { name: "Avistamiento de perezosos + baño en lago + visita Puerto Nariño", gallons: 14 },
  { name: "Canotaje nativo en lago escondido: Puerto Alegre", gallons: 3 },
  { name: "Canotaje nativo en el río Amazonas o en la selva", gallons: 2 },
  { name: "Avistamiento de delfines rosados", gallons: 6 },
  { name: "Taller de palma de chambira", gallons: 0 },
  { name: "Taller de plantas medicinales", gallons: 3 },
  { name: "Ritual cultural indígena: Libertad", gallons: 2 },
  { name: "Cocinar con Doña Marta", gallons: 0 },
];

const GUIDES = ["Alex", "Kevin", "Martin", "Otro"];

const STEPS = {
  GUIDE: "guide", COUNT: "count", ACTIVITIES: "activities",
  FUEL: "fuel", INVOICES: "invoices", REVIEW: "review", DONE: "done",
};

function todayStr() {
  return new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

async function compressImage(dataUrl, maxWidth = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
}

export default function ChunakiGastos() {
  const [step, setStep] = useState(STEPS.GUIDE);
  const [guide, setGuide] = useState("");
  const [otroGuide, setOtroGuide] = useState("");
  const [activityCount, setActivityCount] = useState(1);
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [invoicePreviews, setInvoicePreviews] = useState([]);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [scannedData, setScannedData] = useState([]);
  const [scanning, setScanning] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [fuelConfirmed, setFuelConfirmed] = useState(null);
  const [fuelActualGallons, setFuelActualGallons] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const guideName = guide === "Otro" ? otroGuide : guide;
  const totalGallons = selectedActivities.reduce((sum, a) => sum + (a?.gallons || 0), 0);
  const actualGallons = fuelConfirmed === true ? totalGallons : (parseFloat(fuelActualGallons) || 0);
  const hasDiscrepancy = fuelConfirmed === false && fuelActualGallons !== "";
  const allActivitiesSelected = selectedActivities.every(a => a !== null);
  const allInvoicesUploaded = invoiceFiles.every(f => f !== null);
  const fuelStepComplete = fuelConfirmed === true || (fuelConfirmed === false && fuelActualGallons !== "");

  function handleCountNext() {
    setSelectedActivities(Array(activityCount).fill(null));
    setInvoicePreviews(Array(activityCount).fill(null));
    setInvoiceFiles(Array(activityCount).fill(null));
    setScannedData(Array(activityCount).fill(null));
    setScanning(Array(activityCount).fill(false));
    setStep(STEPS.ACTIVITIES);
  }

  function handleActivitySelect(idx, activity) {
    setSelectedActivities(prev => { const n = [...prev]; n[idx] = activity; return n; });
  }

  async function handleInvoiceUpload(idx, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const compressed = await compressImage(e.target.result);
      const base64 = compressed.split(",")[1];
      const mimeType = "image/jpeg";

      setInvoicePreviews(prev => { const n = [...prev]; n[idx] = compressed; return n; });
      setInvoiceFiles(prev => { const n = [...prev]; n[idx] = { base64, mimeType }; return n; });

      setScanning(prev => { const n = [...prev]; n[idx] = true; return n; });
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, mimeType }),
        });
        const result = await res.json();
        setScannedData(prev => { const n = [...prev]; n[idx] = result; return n; });
      } catch (e) {
        setScannedData(prev => { const n = [...prev]; n[idx] = null; return n; });
      }
      setScanning(prev => { const n = [...prev]; n[idx] = false; return n; });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        guide: guideName,
        groupName,
        date: getTodayISO(),
        activities: selectedActivities,
        fuelEstimated: totalGallons,
        fuelActual: fuelActualGallons,
        fuelConfirmed,
        invoices: invoiceFiles.map((f, i) => ({
          base64: f?.base64 || null,
          mimeType: f?.mimeType || null,
          scanned: scannedData[i] || null,
        })),
      };
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }
      setStep(STEPS.DONE);
    } catch (e) {
      setSubmitError("Hubo un error al enviar: " + e.message);
    }
    setSubmitting(false);
  }

  const colors = {
    jungle: "#2D4A1E", moss: "#4A6741", leaf: "#6B8F47", sand: "#C8A96E",
    bark: "#8B5E3C", cream: "#F5F0E8", white: "#FFFFFF", text: "#1A2E10",
    muted: "#7A8C6E", danger: "#C0392B", warning: "#E67E22",
  };
  const base = { fontFamily: "'Segoe UI', system-ui, sans-serif", background: colors.cream, minHeight: "100vh", color: colors.text };
  const card = { background: colors.white, borderRadius: 16, padding: "24px 20px", marginBottom: 16, boxShadow: "0 2px 12px rgba(45,74,30,0.10)" };
  const header = { background: `linear-gradient(135deg, ${colors.jungle} 0%, ${colors.moss} 100%)`, color: colors.white, padding: "28px 20px 20px", textAlign: "center" };
  const btn = { background: colors.jungle, color: colors.white, border: "none", borderRadius: 12, padding: "14px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 8, letterSpacing: 0.3 };
  const btnSecondary = { ...btn, background: colors.sand, color: colors.jungle };
  const btnOutline = { ...btn, background: "transparent", color: colors.jungle, border: `2px solid ${colors.jungle}` };
  const input = { width: "100%", border: `1.5px solid ${colors.leaf}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, background: colors.cream, color: colors.text, boxSizing: "border-box", outline: "none" };
  const label = { fontSize: 13, fontWeight: 600, color: colors.moss, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block" };
  const tag = { display: "inline-block", background: colors.leaf, color: colors.white, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, marginRight: 6, marginBottom: 4 };

  return (
    <div style={base}>
      <div style={header}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🌿</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>Chunaki</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Registro de Actividades y Gastos</div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6, textTransform: "capitalize" }}>{todayStr()}</div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>

        {step === STEPS.GUIDE && (
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: colors.jungle }}>Hola, bienvenido/a</div>
            <label style={label}>Tu nombre</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {GUIDES.map(g => (
                <button key={g} onClick={() => setGuide(g)} style={{ padding: "10px 18px", borderRadius: 24, border: `2px solid ${guide === g ? colors.jungle : colors.leaf}`, background: guide === g ? colors.jungle : colors.white, color: guide === g ? colors.white : colors.jungle, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{g}</button>
              ))}
            </div>
            {guide === "Otro" && (
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Escribe tu nombre</label>
                <input style={input} placeholder="Nombre completo" value={otroGuide} onChange={e => setOtroGuide(e.target.value)} />
              </div>
            )}
            <button style={{ ...btn, opacity: guideName.trim() ? 1 : 0.5 }} onClick={() => guideName.trim() && setStep(STEPS.COUNT)} disabled={!guideName.trim()}>Continuar</button>
          </div>
        )}

        {step === STEPS.COUNT && (
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: colors.jungle }}>Hola, {guideName}</div>
            <div style={{ color: colors.muted, fontSize: 14, marginBottom: 20 }}>¿Cuántas actividades hiciste hoy?</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, justifyContent: "center" }}>
              <button onClick={() => setActivityCount(c => Math.max(1, c - 1))} style={{ ...btnSecondary, width: 48, height: 48, borderRadius: 24, fontSize: 22, padding: 0, marginTop: 0 }}>-</button>
              <span style={{ fontSize: 36, fontWeight: 700, color: colors.jungle, minWidth: 40, textAlign: "center" }}>{activityCount}</span>
              <button onClick={() => setActivityCount(c => Math.min(6, c + 1))} style={{ ...btnSecondary, width: 48, height: 48, borderRadius: 24, fontSize: 22, padding: 0, marginTop: 0 }}>+</button>
            </div>
            <button style={btn} onClick={handleCountNext}>Continuar</button>
          </div>
        )}

        {step === STEPS.ACTIVITIES && (
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.jungle, marginBottom: 4 }}>Selecciona las actividades</div>
              <div style={{ fontSize: 13, color: colors.muted }}>Guía: {guideName} · {activityCount} actividad{activityCount > 1 ? "es" : ""}</div>
            </div>
            {Array.from({ length: activityCount }).map((_, idx) => (
              <div key={idx} style={{ ...card, borderLeft: `4px solid ${colors.leaf}` }}>
                <div style={{ fontWeight: 700, color: colors.moss, marginBottom: 12, fontSize: 14 }}>Actividad {idx + 1}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ACTIVITIES.map(act => (
                    <button key={act.name} onClick={() => handleActivitySelect(idx, act)} style={{ textAlign: "left", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${selectedActivities[idx]?.name === act.name ? colors.jungle : "#D4DBC8"}`, background: selectedActivities[idx]?.name === act.name ? `${colors.jungle}15` : colors.white, color: colors.text, fontSize: 13, cursor: "pointer", lineHeight: 1.4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span>{act.name}</span>
                      {act.gallons > 0 && <span style={{ ...tag, background: colors.bark, whiteSpace: "nowrap", fontSize: 11 }}>{act.gallons} gal</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button style={{ ...btn, opacity: allActivitiesSelected ? 1 : 0.5 }} disabled={!allActivitiesSelected} onClick={() => { setFuelConfirmed(null); setFuelActualGallons(""); setStep(STEPS.FUEL); }}>Continuar</button>
          </div>
        )}

        {step === STEPS.FUEL && (
          <div>
            <div style={{ ...card, background: colors.jungle, color: colors.white }}>
              <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>Combustible estimado</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{totalGallons} galones</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.jungle, marginBottom: 16 }}>¿Concuerda con el combustible que usaron?</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <button onClick={() => { setFuelConfirmed(true); setFuelActualGallons(""); }} style={{ flex: 1, padding: "14px 10px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", border: `2px solid ${fuelConfirmed === true ? colors.jungle : "#D4DBC8"}`, background: fuelConfirmed === true ? colors.jungle : colors.white, color: fuelConfirmed === true ? colors.white : colors.text }}>✓ Sí, correcto</button>
                <button onClick={() => setFuelConfirmed(false)} style={{ flex: 1, padding: "14px 10px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", border: `2px solid ${fuelConfirmed === false ? colors.warning : "#D4DBC8"}`, background: fuelConfirmed === false ? `${colors.warning}15` : colors.white, color: fuelConfirmed === false ? colors.warning : colors.text }}>✗ No, fue diferente</button>
              </div>
              {fuelConfirmed === false && (
                <div style={{ borderTop: `1px solid #E8EDE3`, paddingTop: 16 }}>
                  <label style={label}>¿Cuántos galones usaron realmente?</label>
                  <input style={input} type="number" placeholder="Ej: 12" value={fuelActualGallons} onChange={e => setFuelActualGallons(e.target.value)} />
                  {fuelActualGallons !== "" && (
                    <div style={{ background: `${colors.warning}12`, borderRadius: 10, padding: 12, marginTop: 10, border: `1px solid ${colors.warning}40` }}>
                      <div style={{ fontSize: 13, color: colors.warning, fontWeight: 600 }}>Diferencia: {parseFloat(fuelActualGallons) - totalGallons > 0 ? "+" : ""}{parseFloat(fuelActualGallons) - totalGallons} galones vs estimado</div>
                    </div>
                  )}
                </div>
              )}
              {fuelConfirmed === true && (
                <div style={{ background: `${colors.leaf}15`, borderRadius: 10, padding: 12, border: `1px solid ${colors.leaf}40` }}>
                  <div style={{ fontSize: 13, color: colors.moss, fontWeight: 600 }}>Perfecto. Se registrarán {totalGallons} galones.</div>
                </div>
              )}
            </div>
            <button style={{ ...btn, opacity: fuelStepComplete ? 1 : 0.5 }} disabled={!fuelStepComplete} onClick={() => setStep(STEPS.INVOICES)}>Continuar a facturas</button>
            <button style={{ ...btnOutline, marginTop: 8 }} onClick={() => setStep(STEPS.ACTIVITIES)}>Volver</button>
          </div>
        )}

        {step === STEPS.INVOICES && (
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.jungle, marginBottom: 4 }}>Fotos de facturas</div>
              <div style={{ fontSize: 13, color: colors.muted }}>Sube una foto de la factura por cada actividad</div>
            </div>
            {selectedActivities.map((act, idx) => (
              <div key={idx} style={{ ...card, borderLeft: `4px solid ${colors.sand}` }}>
                <div style={{ fontWeight: 700, color: colors.bark, marginBottom: 4, fontSize: 13 }}>Actividad {idx + 1}</div>
                <div style={{ fontSize: 14, color: colors.text, marginBottom: 12, lineHeight: 1.4 }}>{act?.name}</div>
                {invoicePreviews[idx] ? (
                  <div>
                    <img src={invoicePreviews[idx]} alt="Factura" style={{ width: "100%", borderRadius: 10, marginBottom: 10, maxHeight: 200, objectFit: "cover" }} />
                    {scanning[idx] && <div style={{ fontSize: 12, color: colors.muted, textAlign: "center", padding: "8px 0" }}>Procesando factura...</div>}
                    {scannedData[idx] && !scanning[idx] && (
                      <div style={{ background: `${colors.leaf}15`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: colors.moss, fontWeight: 700, marginBottom: 4 }}>DATOS LEÍDOS</div>
                        {scannedData[idx].proveedor && <div style={{ fontSize: 12, marginBottom: 2 }}><span style={{ color: colors.muted }}>Proveedor: </span><strong>{scannedData[idx].proveedor}</strong></div>}
                        {scannedData[idx].monto_total && <div style={{ fontSize: 12 }}><span style={{ color: colors.muted }}>Monto: </span><strong>{scannedData[idx].monto_total} {scannedData[idx].moneda}</strong></div>}
                      </div>
                    )}
                    <button style={{ ...btn, background: "#E8EDE3", color: colors.jungle, marginTop: 4, fontSize: 13 }} onClick={() => {
                      setInvoiceFiles(prev => { const n = [...prev]; n[idx] = null; return n; });
                      setInvoicePreviews(prev => { const n = [...prev]; n[idx] = null; return n; });
                      setScannedData(prev => { const n = [...prev]; n[idx] = null; return n; });
                    }}>Cambiar foto</button>
                  </div>
                ) : (
                  <label style={{ display: "block", border: `2px dashed ${colors.leaf}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", color: colors.moss }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Toca para subir foto</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Tomar foto o elegir de galería</div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleInvoiceUpload(idx, e.target.files[0])} />
                  </label>
                )}
              </div>
            ))}
            <button style={{ ...btn, opacity: allInvoicesUploaded ? 1 : 0.5 }} disabled={!allInvoicesUploaded} onClick={() => setStep(STEPS.REVIEW)}>Revisar y enviar</button>
          </div>
        )}

        {step === STEPS.REVIEW && (
          <div>
            <div style={{ ...card, background: colors.jungle, color: colors.white }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Resumen del día</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{todayStr()}</div>
            </div>
            <div style={card}>
              <div style={{ marginBottom: 12 }}>
                <span style={label}>Guía</span>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{guideName}</div>
              </div>
              <div>
                <span style={label}>Grupo / Nombre (opcional)</span>
                <input style={input} placeholder="Nombre del grupo o huéspedes..." value={groupName} onChange={e => setGroupName(e.target.value)} />
              </div>
            </div>
            {selectedActivities.map((act, idx) => (
              <div key={idx} style={{ ...card, borderLeft: `4px solid ${colors.leaf}` }}>
                <div style={{ fontWeight: 700, color: colors.moss, fontSize: 13, marginBottom: 6 }}>Actividad {idx + 1}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{act?.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={tag}>{act.gallons} gal</span>
                  {scannedData[idx]?.monto_total && <span style={{ ...tag, background: colors.bark }}>{scannedData[idx].monto_total} {scannedData[idx].moneda}</span>}
                </div>
                {invoicePreviews[idx] && <img src={invoicePreviews[idx]} alt="" style={{ width: "100%", borderRadius: 8, marginTop: 10, maxHeight: 120, objectFit: "cover" }} />}
              </div>
            ))}
            <div style={{ ...card, border: `1.5px solid ${hasDiscrepancy ? colors.warning : colors.leaf}`, background: hasDiscrepancy ? `${colors.warning}08` : `${colors.jungle}08` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: hasDiscrepancy ? colors.warning : colors.moss, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                {hasDiscrepancy ? "⚠ Combustible con discrepancia" : "Combustible"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: hasDiscrepancy ? 6 : 0 }}>
                <span style={{ fontSize: 13, color: colors.muted }}>Estimado</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{totalGallons} gal</span>
              </div>
              {hasDiscrepancy && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: colors.muted }}>Real</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.warning }}>{actualGallons} gal</span>
                </div>
              )}
            </div>
            {submitError && <div style={{ color: colors.danger, fontSize: 13, textAlign: "center", marginBottom: 8, padding: "10px", background: "#fde8e8", borderRadius: 8 }}>{submitError}</div>}
            <button style={{ ...btn, opacity: submitting ? 0.6 : 1 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Enviando..." : "Confirmar y enviar"}
            </button>
            <button style={{ ...btnOutline, marginTop: 8 }} onClick={() => setStep(STEPS.INVOICES)}>Volver</button>
          </div>
        )}

        {step === STEPS.DONE && (
          <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.jungle, marginBottom: 8 }}>Registro enviado</div>
            <div style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Gracias, {guideName}. Todo quedó guardado en Google Sheets.</div>
            <div style={{ fontSize: 13, color: colors.muted, marginBottom: 32 }}>
              {activityCount} actividad{activityCount > 1 ? "es" : ""} · {actualGallons} galones
            </div>
            <button style={btn} onClick={() => {
              setStep(STEPS.GUIDE); setGuide(""); setOtroGuide(""); setActivityCount(1);
              setSelectedActivities([]); setInvoicePreviews([]); setInvoiceFiles([]);
              setScannedData([]); setGroupName(""); setFuelConfirmed(null); setFuelActualGallons("");
            }}>Nuevo registro</button>
          </div>
        )}
      </div>
    </div>
  );
}
