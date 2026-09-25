(() => {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const API_URL = String(CFG.API_URL || "").trim();
  const state = {
    token: "",
    user: null,
    data: {items: [], masuk: [], keluar: [], rusak: [], settings: {}},
    editingId: null
  };

  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num = v => Number(v || 0);
  const uid = () => "INV-" + Date.now().toString(36).toUpperCase();

  function toast(message, type="info") {
    const box = $("#toast");
    if (!box) return;
    box.textContent = message;
    box.className = `toast show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => box.className = "toast", 3600);
  }

  function setConnection(ok, message) {
    const el = $("#connectionStatus");
    if (!el) return;
    el.className = "connection " + (ok ? "ok" : "bad");
    el.textContent = ok ? "● Terhubung ke Google Sheets" : "● " + (message || "Backend belum terhubung");
  }

  async function api(action, payload={}) {
    if (!API_URL || API_URL.includes("PASTE_GOOGLE")) {
      throw new Error("URL Google Apps Script belum dikonfigurasi.");
    }
    const body = JSON.stringify({action, ...payload});
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body,
      redirect: "follow"
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("Respons backend bukan JSON. Pastikan deployment Apps Script = Web app dan akses = Anyone."); }
    if (!data.ok) throw new Error(data.error || "Backend mengembalikan kegagalan.");
    return data;
  }

  async function healthCheck() {
    try {
      const res = await fetch(API_URL, {method:"GET", redirect:"follow", cache:"no-store"});
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.ok === true) {
        setConnection(true);
        return true;
      }
      throw new Error("Respons GET tidak valid.");
    } catch (e) {
      setConnection(false, e.message);
      return false;
    }
  }

  function show(screen) {
    $$(".screen").forEach(x => x.classList.remove("active"));
    const target = $("#" + screen);
    if (target) target.classList.add("active");
    $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.screen === screen));
    if (screen === "dashboard") renderAll();
    if (screen === "inventory") renderInventory();
    if (screen === "transactions") renderTransactions();
    if (screen === "reports") renderReports();
    if (screen === "settings") renderSettings();
  }

  function loginView(on) {
    $("#loginView").classList.toggle("hidden", !on);
    $("#appView").classList.toggle("hidden", on);
  }

  async function login() {
    const username = $("#username").value.trim();
    const password = $("#password").value;
    if (!username || !password) return toast("Isi username dan password.", "warn");
    $("#loginBtn").disabled = true;
    try {
      const r = await api("login", {username, password});
      state.token = r.token || "";
      state.user = r.user;
      loginView(false);
      $("#userName").textContent = state.user.name || state.user.username;
      $("#userRole").textContent = state.user.role || "Operator";
      await bootstrap();
      toast("Login berhasil.", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      $("#loginBtn").disabled = false;
    }
  }

  async function bootstrap() {
    try {
      const r = await api("bootstrap", {token: state.token});
      state.data = r.data || state.data;
      setConnection(true);
      renderAll();
    } catch (e) {
      setConnection(false, e.message);
      toast("Login berhasil, tetapi data belum bisa diambil: " + e.message, "error");
    }
  }

  async function saveItem() {
    const item = {
      id: state.editingId || uid(),
      kode: $("#fKode").value.trim(),
      nama: $("#fNama").value.trim(),
      kategori: $("#fKategori").value.trim(),
      ruangan: $("#fRuangan").value.trim(),
      jumlah: num($("#fJumlah").value),
      kondisi: $("#fKondisi").value,
      sumber: $("#fSumber").value.trim(),
      foto: $("#fFoto").value.trim(),
      keterangan: $("#fKeterangan").value.trim()
    };
    if (!item.kode || !item.nama) return toast("Kode dan nama barang wajib diisi.", "warn");
    try {
      await api("saveItem", {token: state.token, item});
      closeModal();
      await bootstrap();
      toast("Data barang tersimpan.", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function removeItem(id) {
    if (!confirm("Hapus barang ini?")) return;
    try {
      await api("deleteItem", {token: state.token, id});
      await bootstrap();
      toast("Barang dihapus.", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function saveTransaction() {
    const t = {
      id: uid(),
      tanggal: $("#tTanggal").value,
      jenis: $("#tJenis").value,
      kode: $("#tKode").value.trim(),
      jumlah: num($("#tJumlah").value),
      keterangan: $("#tKeterangan").value.trim()
    };
    if (!t.kode || !t.jumlah) return toast("Kode dan jumlah wajib diisi.", "warn");
    try {
      await api("saveTransaction", {token: state.token, transaction:t});
      $("#transactionModal").classList.remove("open");
      await bootstrap();
      toast("Transaksi tersimpan.", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  function totals() {
    const items = state.data.items || [];
    return {
      total: items.reduce((a,b)=>a+num(b.jumlah),0),
      masuk: (state.data.masuk||[]).reduce((a,b)=>a+num(b.jumlah),0),
      keluar: (state.data.keluar||[]).reduce((a,b)=>a+num(b.jumlah),0),
      rusak: (state.data.rusak||[]).reduce((a,b)=>a+num(b.jumlah),0)
    };
  }

  function renderAll() {
    const t = totals();
    $("#statTotal").textContent = t.total;
    $("#statMasuk").textContent = t.masuk;
    $("#statKeluar").textContent = t.keluar;
    $("#statRusak").textContent = t.rusak;
    renderInventory();
    renderTransactions();
    renderCategoryRoom();
  }

  function renderInventory() {
    const q = ($("#search").value || "").toLowerCase();
    const cat = $("#filterCategory").value;
    const room = $("#filterRoom").value;
    let rows = (state.data.items||[]).filter(x => {
      const hit = [x.kode,x.nama,x.kategori,x.ruangan].join(" ").toLowerCase().includes(q);
      return hit && (!cat || x.kategori===cat) && (!room || x.ruangan===room);
    });
    $("#inventoryBody").innerHTML = rows.map(x => `
      <tr>
        <td><b>${esc(x.kode)}</b></td><td>${esc(x.nama)}</td><td>${esc(x.kategori)}</td>
        <td>${esc(x.ruangan)}</td><td>${num(x.jumlah)}</td><td><span class="badge">${esc(x.kondisi)}</span></td>
        <td><button class="iconbtn" onclick='showQR(${JSON.stringify(x.kode)})'>QR</button></td>
        <td><button class="iconbtn" onclick='editItem(${JSON.stringify(x)})'>Edit</button>
        <button class="iconbtn danger" onclick='removeItem(${JSON.stringify(x.id)})'>Hapus</button></td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty">Belum ada data inventaris.</td></tr>`;
    fillFilters();
  }

  function fillFilters() {
    const items = state.data.items||[];
    const cats=[...new Set(items.map(x=>x.kategori).filter(Boolean))].sort();
    const rooms=[...new Set(items.map(x=>x.ruangan).filter(Boolean))].sort();
    const c=$("#filterCategory"), r=$("#filterRoom");
    const cv=c.value, rv=r.value;
    c.innerHTML = `<option value="">Semua kategori</option>`+cats.map(x=>`<option>${esc(x)}</option>`).join("");
    r.innerHTML = `<option value="">Semua ruangan</option>`+rooms.map(x=>`<option>${esc(x)}</option>`).join("");
    c.value=cv; r.value=rv;
  }

  function renderCategoryRoom() {
    const items=state.data.items||[];
    const cats={}, rooms={};
    items.forEach(x=>{cats[x.kategori]=(cats[x.kategori]||0)+num(x.jumlah); rooms[x.ruangan]=(rooms[x.ruangan]||0)+num(x.jumlah);});
    $("#categoryStats").innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<div class="statline"><span>${esc(k)}</span><b>${v}</b></div>`).join("") || `<div class="empty">Belum ada data.</div>`;
    $("#roomStats").innerHTML=Object.entries(rooms).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<div class="statline"><span>${esc(k)}</span><b>${v}</b></div>`).join("") || `<div class="empty">Belum ada data.</div>`;
  }

  function renderTransactions() {
    const all=[...(state.data.masuk||[]),...(state.data.keluar||[]),...(state.data.rusak||[])].sort((a,b)=>String(b.tanggal).localeCompare(String(a.tanggal)));
    $("#transactionBody").innerHTML=all.slice(0,30).map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.jenis)}</td><td>${esc(x.kode)}</td><td>${num(x.jumlah)}</td><td>${esc(x.keterangan)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Belum ada transaksi.</td></tr>`;
  }

  function renderReports() {
    const t=totals();
    $("#reportSummary").innerHTML = `<div class="reportcards"><div><b>${t.total}</b><span>Total unit</span></div><div><b>${t.masuk}</b><span>Barang masuk</span></div><div><b>${t.keluar}</b><span>Barang keluar</span></div><div><b>${t.rusak}</b><span>Barang rusak</span></div></div>`;
  }

  function renderSettings() {
    const s=state.data.settings||{};
    $("#sNama").value=s.namaSekolah||"";
    $("#sKepala").value=s.kepalaSekolah||"";
    $("#sPJ").value=s.penanggungJawab||"";
    $("#sNIP").value=s.nip||"";
    $("#sLogo").value=s.logo||"";
    $("#sTheme").value=s.theme||"light";
  }

  async function saveSettings() {
    const settings={namaSekolah:$("#sNama").value, kepalaSekolah:$("#sKepala").value, penanggungJawab:$("#sPJ").value, nip:$("#sNIP").value, logo:$("#sLogo").value, theme:$("#sTheme").value};
    try { await api("saveSettings",{token:state.token,settings}); await bootstrap(); toast("Pengaturan tersimpan.","success"); }
    catch(e){toast(e.message,"error");}
  }

  function openModal(item=null) {
    state.editingId=item?.id||null;
    $("#modalTitle").textContent=item?"Edit Barang":"Tambah Barang";
    const x=item||{};
    $("#fKode").value=x.kode||""; $("#fNama").value=x.nama||""; $("#fKategori").value=x.kategori||"";
    $("#fRuangan").value=x.ruangan||""; $("#fJumlah").value=num(x.jumlah); $("#fKondisi").value=x.kondisi||"Baik";
    $("#fSumber").value=x.sumber||""; $("#fFoto").value=x.foto||""; $("#fKeterangan").value=x.keterangan||"";
    $("#itemModal").classList.add("open");
  }
  function closeModal(){ $("#itemModal").classList.remove("open"); }
  function editItem(x){openModal(x);}
  function showQR(code){
    $("#qrBox").innerHTML="";
    if(window.QRCode) new QRCode($("#qrBox"), {text:String(code), width:220, height:220});
    $("#qrCodeText").textContent=code;
    $("#qrModal").classList.add("open");
  }

  function downloadCSV() {
    const rows=state.data.items||[];
    const header=["Kode","Nama","Kategori","Ruangan","Jumlah","Kondisi","Sumber","Keterangan"];
    const csv=[header,...rows.map(x=>[x.kode,x.nama,x.kategori,x.ruangan,x.jumlah,x.kondisi,x.sumber,x.keterangan])].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"})); a.download="inventaris.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  function downloadJSON() {
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([JSON.stringify(state.data,null,2)],{type:"application/json"}));
    a.download="backup-inventaris.json"; a.click(); URL.revokeObjectURL(a.href);
  }

  async function restoreJSON(file) {
    try {
      const data=JSON.parse(await file.text());
      await api("restore",{token:state.token,data});
      await bootstrap(); toast("Restore berhasil.","success");
    } catch(e){toast(e.message,"error");}
  }

  function exportPDF(){
    if(!window.jspdf){return toast("Library PDF belum termuat. Muat ulang halaman.","error");}
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    doc.setFontSize(16); doc.text("Laporan Inventaris Sekolah",14,18);
    const rows=(state.data.items||[]).map(x=>[x.kode,x.nama,x.kategori,x.ruangan,x.jumlah,x.kondisi]);
    doc.autoTable({head:[["Kode","Barang","Kategori","Ruangan","Jumlah","Kondisi"]],body:rows,startY:25});
    doc.save("laporan-inventaris.pdf");
  }

  function exportExcel(){
    if(!window.XLSX) return toast("Library Excel belum termuat.","error");
    const rows=(state.data.items||[]).map(x=>({Kode:x.kode,Nama:x.nama,Kategori:x.kategori,Ruangan:x.ruangan,Jumlah:x.jumlah,Kondisi:x.kondisi,Sumber:x.sumber,Keterangan:x.keterangan}));
    const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws,"Inventaris"); XLSX.writeFile(wb,"inventaris.xlsx");
  }

  async function importExcel(file){
    if(!window.XLSX) return toast("Library Excel belum termuat.","error");
    try{
      const data=await file.arrayBuffer(), wb=XLSX.read(data);
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      let count=0;
      for(const r of rows){
        const item={id:uid(),kode:r.Kode||r.kode,nama:r.Nama||r.nama,kategori:r.Kategori||r.kategori,ruangan:r.Ruangan||r.ruangan,jumlah:num(r.Jumlah||r.jumlah),kondisi:r.Kondisi||r.kondisi||"Baik",sumber:r.Sumber||"",foto:r.Foto||"",keterangan:r.Keterangan||""};
        if(item.kode && item.nama){await api("saveItem",{token:state.token,item});count++;}
      }
      await bootstrap(); toast(`${count} data berhasil diimpor.`,"success");
    }catch(e){toast(e.message,"error");}
  }

  function bind(){
    $("#loginBtn").onclick=login;
    $("#password").addEventListener("keydown",e=>{if(e.key==="Enter")login();});
    $$(".nav button").forEach(b=>b.onclick=()=>show(b.dataset.screen));
    $("#logoutBtn").onclick=()=>{state.token="";state.user=null;loginView(true);};
    $("#addBtn").onclick=()=>openModal();
    $("#saveItemBtn").onclick=saveItem;
    $("#closeItem").onclick=closeModal;
    $("#cancelItem").onclick=closeModal;
    $("#saveTransactionBtn").onclick=saveTransaction;
    $("#closeTransaction").onclick=()=>$("#transactionModal").classList.remove("open");
    $("#newTransactionBtn").onclick=()=>$("#transactionModal").classList.add("open");
    $("#saveSettingsBtn").onclick=saveSettings;
    $("#csvBtn").onclick=downloadCSV; $("#excelBtn").onclick=exportExcel; $("#pdfBtn").onclick=exportPDF;
    $("#backupBtn").onclick=downloadJSON;
    $("#restoreFile").onchange=e=>e.target.files[0]&&restoreJSON(e.target.files[0]);
    $("#importFile").onchange=e=>e.target.files[0]&&importExcel(e.target.files[0]);
    $("#search").oninput=renderInventory; $("#filterCategory").onchange=renderInventory; $("#filterRoom").onchange=renderInventory;
    $("#healthBtn").onclick=healthCheck;
    $("#refreshBtn").onclick=bootstrap;
    $("#themeBtn").onclick=()=>document.body.classList.toggle("dark");
  }

  window.editItem=editItem; window.removeItem=removeItem; window.showQR=showQR;

  document.addEventListener("DOMContentLoaded", async ()=>{
    bind();
    $("#version").textContent=CFG.APP_VERSION||"2.1.0";
    const ok=await healthCheck();
    if(!ok) toast("Backend belum terhubung. Cek deployment Apps Script.","error");
  });
})();
