import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Time formatting helpers
// ---------------------------------------------------------------------------

function formatStart(startedAt) {
  if (!startedAt) return "—";
  return (
    new Date(startedAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/New_York",
    }) + " ET"
  );
}

function formatElapsed(startedAt, finishedAt, now) {
  if (!startedAt) return "—";

  const start = new Date(startedAt);
  const end = finishedAt ? new Date(finishedAt) : now;
  const totalSec = Math.max(0, Math.floor((end - start) / 1000));

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts = [];
  if (h) parts.push(`${h}h`);
  if (h || m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Status pill — matches the existing color scheme (gray/blue/green/red)
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  failed_final: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

function StatusPill({ status }) {
  const cls = STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-sm font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Job label — mirrors "scrape · West (AK, CA, CO, ...)" style, bolding any
// states worth calling out (pass activeStates per row if you want that)
// ---------------------------------------------------------------------------

function JobLabel({ jobType, groupLabel, states = [], activeStates = [] }) {
  return (
    <span className="font-semibold text-gray-900">
      {jobType}
      {groupLabel ? (
        <>
          {" · "}
          {groupLabel}
          {states.length > 0 && (
            <>
              {" ("}
              {states.map((s, i) => (
                <span key={s}>
                  <span
                    className={
                      activeStates.includes(s) ? "text-green-600 font-bold" : ""
                    }
                  >
                    {s}
                  </span>
                  {i < states.length - 1 ? ", " : ""}
                </span>
              ))}
              {")"}
            </>
          )}
        </>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

export default function JobQueueTable({ jobs }) {
  // Tick every second so "running" rows' elapsed time updates live.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const data = jobs && jobs.length > 0 ? jobs : SAMPLE_JOBS;

  return (
    <div className="w-full">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Job queue (24h)</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-500">
              <th className="py-3 px-4 font-medium">date</th>
              <th className="py-3 px-4 font-medium">job</th>
              <th className="py-3 px-4 font-medium">status</th>
              <th className="py-3 px-4 font-medium">start</th>
              <th className="py-3 px-4 font-medium">elapsed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="py-3 px-4 text-gray-700">{row.date}</td>
                <td className="py-3 px-4">
                  <JobLabel
                    jobType={row.jobType}
                    groupLabel={row.groupLabel}
                    states={row.states}
                    activeStates={row.activeStates}
                  />
                </td>
                <td className="py-3 px-4">
                  <StatusPill status={row.status} />
                </td>
                <td className="py-3 px-4 text-gray-700 font-mono text-sm">
                  {formatStart(row.startedAt)}
                </td>
                <td className="py-3 px-4 text-gray-700 font-mono text-sm">
                  {formatElapsed(row.startedAt, row.finishedAt, now)}
                  {row.status === "running" && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample data — shape matches public.worker_jobs. Swap this out for your
// real fetch (e.g. the same query the admin board already runs), mapping:
//   date        <- enqueued_at (date part)
//   jobType     <- job_type
//   groupLabel  <- state grouping name, or omit for vertical-level jobs
//   states      <- state_groupings.states for that grouping
//   activeStates<- states with an active oip_subscriptions row (optional)
//   status      <- status
//   startedAt   <- started_at
//   finishedAt  <- finished_at
// ---------------------------------------------------------------------------

const SAMPLE_JOBS = [
  {
    id: "13f2f1ab",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "sam",
    states: [],
    status: "queued",
    startedAt: null,
    finishedAt: null,
  },
  {
    id: "2435eb77",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "West",
    states: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
    activeStates: [],
    status: "success",
    startedAt: "2026-08-15T21:17:13.510Z",
    finishedAt: "2026-08-15T21:19:04.200Z",
  },
  {
    id: "3c61d731",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "Southwest",
    states: ["AZ", "NM", "OK", "TX"],
    activeStates: ["TX"],
    status: "running",
    startedAt: "2026-08-15T21:17:13.510Z",
    finishedAt: null,
  },
  {
    id: "e6273a37",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "Southeast",
    states: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV"],
    activeStates: ["FL"],
    status: "running",
    startedAt: "2026-08-15T21:17:13.510Z",
    finishedAt: null,
  },
  {
    id: "d4d903ab",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "Midwest",
    states: ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"],
    activeStates: [],
    status: "running",
    startedAt: "2026-08-15T21:17:13.510Z",
    finishedAt: null,
  },
  {
    id: "3ded19f8",
    date: "8/15/2026",
    jobType: "scrape",
    groupLabel: "Northeast",
    states: ["CT", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
    activeStates: ["MA", "NY"],
    status: "running",
    startedAt: "2026-08-15T21:17:13.510Z",
    finishedAt: null,
  },
];
