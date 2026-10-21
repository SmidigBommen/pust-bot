import { activityLabels } from "../domain/activity.js";
import { reportPath, type WeeklyReport } from "../domain/weekly-report.js";

const numbers = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "Europe/Oslo" });
const timestamps = new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Oslo" });
const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const number = (value: number): string => numbers.format(value);
const date = (value: string): string => dates.format(new Date(`${value}T12:00:00Z`));
const duration = (minutes: number): string => minutes >= 60
  ? `${number(Math.floor(minutes / 60))} t${minutes % 60 ? ` ${number(minutes % 60)} min` : ""}` : `${number(minutes)} min`;
const percent = (value: number, total: number): number => Math.max(0, Math.min(100, total ? value / total * 100 : 0));

function week(dateString: string): { year: number; number: number } {
  const thursday = new Date(`${dateString}T12:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  return { year, number: Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7) };
}

const paths = {
  mountain: '<path d="m2 19 7-13 5 8 3-5 5 10H2Z"/><path d="m6 12 3 2 3-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  flame: '<path d="M12 3c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 2 3 2 3s3-4 1-9Z"/>',
  arrowLeft: '<path d="m14 6-6 6 6 6"/>',
  arrowRight: '<path d="m10 6 6 6-6 6"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8m-10 5h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chart: '<path d="M4 20h16M7 16v-5m5 5V5m5 11V8"/>',
} as const;
function icon(name: keyof typeof paths): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

const landscape = `<svg class="landscape" viewBox="0 0 600 230" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#d4b181" stop-opacity=".15"/><stop offset="1" stop-color="#101f1d" stop-opacity="0"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h600v230H0z"/><circle cx="425" cy="65" r="27" fill="#dfbd83" opacity=".8"/><path d="m0 210 95-96 55 43 100-119 92 92 55-45 118 115 85-45v75H0Z" fill="#384f43"/><path d="m204 93 46-55 46 46-30-11-14 18-13-19-18 23Z" fill="#91a28b" opacity=".5"/><path d="m0 230 128-89 110 72 130-80 129 63 103-62v96Z" fill="#263e31"/><path d="m0 230 138-39 131 28 123-36 120 28 88-24v43Z" fill="#183027"/><g fill="#11251e"><path d="m482 132-19 41h11l-20 34h21v23h14v-23h21l-20-34h11ZM531 150l-15 33h8l-15 26h16v21h11v-21h17l-16-26h9ZM565 103l-23 50h13l-25 43h27v34h17v-34h28l-26-43h13Z"/></g></svg>`;

function layout(title: string, body: string, archive = false): string {
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#101f1d"><meta name="description" content="Ukens bevegelse i Gnist. Felles fremgang, én uke av gangen."><title>${escape(title)} · Pust</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/pust.css"></head><body><a class="skip" href="#innhold">Hopp til innhold</a><div class="wrap"><header class="site-header"><a class="brand" href="/" aria-label="Pust, siste rapport"><svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m4 30 12-21 8 14 5-8 8 15H4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m12 17 4 3 4-3" stroke="currentColor" stroke-width="2"/></svg><span class="brand-name">pust</span><span class="brand-by">AV GNIST</span></a><nav class="site-nav" aria-label="Hovedmeny"><a href="/"${archive ? "" : ' aria-current="page"'}>Siste rapport</a><a class="nav-label" href="/arkiv"${archive ? ' aria-current="page"' : ""}>${icon("archive")}Ukearkiv</a></nav></header><main id="innhold">${body}</main><footer class="page-footer"><p><span class="footer-brand">Pust av Gnist</span><br>All bevegelse teller. Sammen, i vårt eget tempo.</p><p>Et felles tilbakeblikk, hver søndag kl. 22:00.<br>Offentlig arkiv med gruppetall. Ingen individuelle resultater.</p></footer></div></body></html>`;
}

function intro(title = "Ukens Pust", subtitle = "Små turer. Lange økter. Alt vi får til sammen."): string {
  return `<section class="intro"><p class="eyebrow">Gnist i bevegelse</p><h1>${title}</h1><p>${subtitle}</p>${landscape}</section>`;
}

function goal(value: number, target: number, label: string): string {
  const reached = value >= target;
  return `<div class="goal-track" role="progressbar" aria-label="${label}" aria-valuenow="${Math.min(value, target)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuetext="${number(value)} av ${number(target)}"><div class="goal-fill" style="width:${percent(value, target)}%"></div></div><div class="goal-meta"><span>${number(value)} / ${number(target)} ${label}</span><strong>${reached ? "Målet er nådd" : `${number(Math.round(value / target * 100))} % av målet`}</strong></div>`;
}

function notice(report: WeeklyReport): string {
  if (report.kind === "scheduled") return "";
  const heading = report.kind === "reconstructed" ? "Rekonstruert fra aktivitetsloggen" : "Rapporten ble opprettet senere";
  const explanation = report.kind === "reconstructed"
    ? "Tallene viser aktivitetsloggen ved import, og kan avvike fra tidligere Slack-innlegg."
    : "Pust gikk glipp av publiseringstidspunktet. Tallene kan inkludere registreringer og endringer etter søndag kl. 22:00.";
  return `<aside class="notice">${icon("info")}<p><strong>${heading}.</strong> ${explanation} Historiske mål og gruppestreak er ikke kjent.</p></aside>`;
}

function activityCard(report: WeeklyReport): string {
  const { progress } = report;
  const max = Math.max(1, ...progress.byType.map(row => row.minutes));
  return `<section class="card activity-card"><div class="card-heading"><h3>Ukens aktiviteter</h3>${icon("mountain")}</div><p class="section-subtitle">Hver aktivitet fra 10 minutter teller.</p>${progress.byType.length ? `<ul class="activity-list">${progress.byType.map(row => `<li class="activity-row type-${row.type}"><div class="activity-top"><span class="activity-name"><span class="dot"></span>${escape(activityLabels[row.type])}</span><span class="activity-data">${duration(row.minutes)}${row.distanceKm > 0 ? `<br><small>${number(row.distanceKm)} km registrert</small>` : ""}</span></div><div class="activity-track" aria-hidden="true"><div class="activity-fill" style="width:${percent(row.minutes, max)}%"></div></div></li>`).join("")}</ul>` : '<p class="empty-activity">Ingen registrerte aktiviteter denne uken.<br>Vi tar en ny uke i vårt eget tempo.</p>'}</section>`;
}

function trendCard(report: WeeklyReport, reports: readonly WeeklyReport[]): string {
  const history = reports.filter(row => row.range.start <= report.range.start).slice(0, 8).reverse();
  const chart = (key: "totalMinutes" | "participants", heading: string, unit: string): string => {
    const max = Math.max(1, ...history.map(row => row.progress[key]));
    return `<div class="chart-block ${key === "participants" ? "participant-chart" : ""}"><p class="chart-heading">${heading}<span>${unit}</span></p><div class="chart" role="group" aria-label="${heading} per uke">${history.map(row => `<a class="chart-column" href="${reportPath(row.range.start)}"${row.range.start === report.range.start ? ' aria-current="page"' : ""} aria-label="Uke ${week(row.range.start).number}, ${week(row.range.start).year}: ${number(row.progress[key])} ${unit}" title="${date(row.range.start)} til ${date(row.range.end)}: ${number(row.progress[key])} ${unit}"><span class="chart-value">${number(row.progress[key])}</span><span class="chart-bar" style="height:${percent(row.progress[key], max) * .72}%"></span></a>`).join("")}</div><div class="chart-labels" aria-hidden="true">${history.map(row => `<span>U${week(row.range.start).number}</span>`).join("")}</div></div>`;
  };
  return `<section class="card trend-card"><div class="card-heading"><h3>Uke for uke</h3>${icon("chart")}</div><p class="section-subtitle">${history.length === 8 ? "Åtte" : history.length} ${history.length === 1 ? "uke" : "uker"} frem til denne rapporten.</p>${chart("totalMinutes", "Tid i bevegelse", "minutter")}${chart("participants", "Deltakelse", "deltakere")}<details class="chart-table"><summary>Se tall og rapportgrunnlag</summary><table><caption class="chart-caption">Publiserte tall. Importerte og sene rapporter kan inkludere senere registreringer.</caption><thead><tr><th scope="col">Uke</th><th scope="col">Minutter</th><th scope="col">Deltakere</th><th scope="col">Grunnlag</th></tr></thead><tbody>${history.map(row => `<tr><th scope="row"><a href="${reportPath(row.range.start)}">${week(row.range.start).number}/${week(row.range.start).year}</a></th><td>${number(row.progress.totalMinutes)}</td><td>${row.progress.participants}</td><td>${kindLabel(row)}</td></tr>`).join("")}</tbody></table></details></section>`;
}

function kindLabel(report: WeeklyReport): string {
  return report.kind === "reconstructed" ? "Rekonstruert" : report.kind === "late" ? "Opprettet senere" : "Søndag kl. 22:00";
}

function archiveList(reports: readonly WeeklyReport[], selected?: WeeklyReport): string {
  const years = [...new Set(reports.map(report => week(report.range.start).year))];
  return `<section class="archive-section" aria-labelledby="archive-heading"><div class="section-heading"><h2 id="archive-heading">En uke av gangen</h2><span>${reports.length} ${reports.length === 1 ? "rapport" : "rapporter"} i arkivet</span></div>${years.map((year, index) => {
    const rows = reports.filter(report => week(report.range.start).year === year);
    return `<details class="year-group"${(selected ? week(selected.range.start).year === year : index === 0) ? " open" : ""}><summary>${year}<span>${rows.length} ${rows.length === 1 ? "uke" : "uker"}</span></summary><div class="archive-grid">${rows.map(row => `<a class="archive-week" href="${reportPath(row.range.start)}"${row.range.start === selected?.range.start ? ' aria-current="page"' : ""}><strong>Uke ${week(row.range.start).number}</strong><span class="week-date">${date(row.range.start)} – ${date(row.range.end)}</span><span class="week-stats"><span>${duration(row.progress.totalMinutes)}</span><span>${row.progress.participants} ${row.progress.participants === 1 ? "deltaker" : "deltakere"}</span></span><span class="report-kind">${kindLabel(row)}</span></a>`).join("")}</div></details>`;
  }).join("")}</section>`;
}

export function reportPage(report: WeeklyReport, reports: readonly WeeklyReport[]): string {
  const index = reports.findIndex(row => row.range.start === report.range.start);
  const older = reports[index + 1];
  const newer = index > 0 ? reports[index - 1] : undefined;
  const arrow = (row: WeeklyReport | undefined, direction: "Left" | "Right", label: string): string => row
    ? `<a class="nav-arrow" href="${reportPath(row.range.start)}" aria-label="${label}" title="${label}">${icon(`arrow${direction}`)}</a>`
    : `<span class="nav-arrow" aria-disabled="true">${icon(`arrow${direction}`)}</span>`;
  const { progress, goals } = report;
  const iso = week(report.range.start);
  const hours = Math.floor(progress.totalMinutes / 60);
  const minutes = progress.totalMinutes % 60;
  const reached = goals && progress.participants >= goals.participantGoal && progress.totalMinutes >= goals.minutesGoal;
  const time = `${hours ? `${number(hours)}<span class="unit"> t</span> ` : ""}${minutes || !hours ? `${number(minutes)}<span class="unit"> min</span>` : ""}`;
  const body = `${intro()}<div class="week-nav"><div class="week-label"><h2>Uke ${iso.number}, ${iso.year}</h2><span>${date(report.range.start)} – ${date(report.range.end)} · søndag kl. 22:00</span></div><nav class="nav-arrows" aria-label="Bla mellom uker">${arrow(older, "Left", "Forrige uke")}${arrow(newer, "Right", "Neste uke")}</nav></div>${notice(report)}<div class="dashboard"><section class="card time-card"><div class="card-heading"><h3>Tid i bevegelse</h3>${icon("clock")}</div><p class="big-number">${time}</p><p class="metric-note">${number(progress.totalMinutes)} minutter sammen denne uken</p>${goals ? goal(progress.totalMinutes, goals.minutesGoal, "minutter") : '<p class="goal-meta">Ukens minuttmål er ikke kjent.</p>'}<div class="summary-line"><span><strong>${number(progress.activityCount)}</strong> ${progress.activityCount === 1 ? "aktivitet" : "aktiviteter"}</span><span><strong>${progress.byType.length}</strong> ${progress.byType.length === 1 ? "aktivitetstype" : "aktivitetstyper"}</span></div></section><section class="card participation-card"><div class="card-heading"><h3>Deltakelse</h3>${icon("people")}</div><p class="big-number">${progress.participants}${goals ? ` <small>/ ${goals.memberCount}</small>` : ""}</p><p class="metric-note">${goals ? "medlemmer i bevegelse" : "deltakere denne uken"}</p>${goals ? goal(progress.participants, goals.participantGoal, "deltakere") : '<p class="goal-meta">Ukens deltakelsesmål er ikke kjent.</p>'}</section><section class="card streak-card"><div class="card-heading"><h3>Gruppestreak</h3>${icon("flame")}</div>${goals ? `<p class="big-number">${goals.groupStreak}<small> ${goals.groupStreak === 1 ? "uke" : "uker"}</small></p><p class="metric-note">Felles mål, felles fremgang</p>${reached ? `<span class="pill">${icon("check")}Full pust!</span>` : '<p class="streak-note">Vi bygger videre,<br>én uke av gangen.</p>'}` : '<p class="big-number unknown">Ukjent</p><p class="metric-note">Historiske mål er ikke lagret</p><p class="streak-note">Aktivitetene teller like fullt.</p>'}</section>${activityCard(report)}${trendCard(report, reports)}</div><p class="publication-note">${report.kind === "scheduled" ? "Publisert" : "Opprettet"} ${timestamps.format(new Date(report.generatedAt))}, Oslo-tid. Rapporten er et lagret øyeblikksbilde og endres ikke ved senere registreringer.${goals ? " Mål, medlemstall og gruppestreak er lagret slik de ble beregnet ved publisering." : ""}</p>${archiveList(reports, report)}`;
  return layout(`Uke ${iso.number}, ${iso.year}`, body);
}

export function archivePage(reports: readonly WeeklyReport[]): string {
  return layout("Ukearkiv", `${intro("Ukearkivet", "Et tilbakeblikk på alt vi har fått til sammen.")}${reports.length ? archiveList(reports) : emptyContent()}`, true);
}

function emptyContent(): string {
  return `<section class="empty-state">${icon("mountain")}<h2>Den første uken ligger foran oss</h2><p>Her samler vi ukens bevegelse i Gnist. Den første rapporten kommer søndag kl. 22:00, Oslo-tid.</p></section>`;
}

export function emptyPage(): string { return layout("Ukens Pust", intro() + emptyContent()); }
export function notFoundPage(): string {
  return layout("Rapporten finnes ikke", `${intro()}<section class="empty-state"><h2>Denne rapporten finnes ikke</h2><p>Uken er ikke publisert, eller lenken er feil.</p><a class="error-link" href="/arkiv">Gå til ukearkivet</a></section>`);
}

export const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#101f1d"/><path d="m5 29 11-19 8 13 5-8 7 14H5Z" fill="none" stroke="#b8d9a0" stroke-width="2" stroke-linejoin="round"/></svg>';
