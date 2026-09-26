/**
 * Schedule Broker for pipeline execution.
 * Standard 5-field cron parser and scheduler using native node:timers with zero external dependencies.
 */

import { PipelineError } from "./schema";

export interface ScheduledJobInfo {
  id: string;
  cronExpression: string;
  running: boolean;
  lastRunAt?: string;
  runCount: number;
}

/**
 * Checks if a specific integer value matches a cron field segment.
 * Supports: *, * /step, min-max, val1,val2, exact value.
 */
export function matchCronField(pattern: string, value: number, min: number, max: number): boolean {
  if (pattern === "*") {
    return true;
  }

  // Handle comma-separated values (e.g. 1,15,30)
  if (pattern.includes(",")) {
    const parts = pattern.split(",");
    return parts.some((p) => matchCronField(p.trim(), value, min, max));
  }

  // Handle step values (e.g. */5 or 10-30/5)
  if (pattern.includes("/")) {
    const [rangePart, stepStr] = pattern.split("/");
    const step = Number.parseInt(stepStr, 10);
    if (Number.isNaN(step) || step <= 0) {
      return false;
    }

    let rangeStart = min;
    let rangeEnd = max;

    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [s, e] = rangePart.split("-").map((v) => Number.parseInt(v, 10));
        if (!Number.isNaN(s) && !Number.isNaN(e)) {
          rangeStart = s;
          rangeEnd = e;
        }
      } else {
        const s = Number.parseInt(rangePart, 10);
        if (!Number.isNaN(s)) {
          rangeStart = s;
        }
      }
    }

    if (value < rangeStart || value > rangeEnd) {
      return false;
    }

    return (value - rangeStart) % step === 0;
  }

  // Handle ranges (e.g. 1-5)
  if (pattern.includes("-")) {
    const [startStr, endStr] = pattern.split("-");
    const start = Number.parseInt(startStr, 10);
    const end = Number.parseInt(endStr, 10);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return false;
    }
    return value >= start && value <= end;
  }

  // Handle exact number
  const target = Number.parseInt(pattern, 10);
  return !Number.isNaN(target) && value === target;
}

/**
 * Checks if a date matches a standard 5-part cron expression.
 * Format: minute hour day-of-month month day-of-week
 */
export function isCronMatch(cronExpression: string, date: Date = new Date()): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new PipelineError(
      `Invalid cron expression '${cronExpression}'. Exactly 5 fields required (minute, hour, day-of-month, month, day-of-week).`,
      "INVALID_CRON_EXPRESSION",
      { cronExpression, fieldsCount: parts.length }
    );
  }

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dow = date.getDay(); // 0-6 (0 is Sunday)

  return (
    matchCronField(minPart, minute, 0, 59) &&
    matchCronField(hourPart, hour, 0, 23) &&
    matchCronField(domPart, dom, 1, 31) &&
    matchCronField(monthPart, month, 1, 12) &&
    matchCronField(dowPart, dow, 0, 6)
  );
}

export class ScheduleBroker {
  private readonly jobs = new Map<
    string,
    {
      cronExpression: string;
      handler: () => Promise<unknown> | unknown;
      timer: NodeJS.Timeout;
      running: boolean;
      lastRunAt?: string;
      runCount: number;
    }
  >();

  /**
   * Registers and activates a scheduled job evaluated every checkIntervalMs (default: 60000ms / 1 min).
   */
  scheduleJob(
    id: string,
    cronExpression: string,
    handler: () => Promise<unknown> | unknown,
    checkIntervalMs = 60000
  ): { stop: () => void } {
    if (this.jobs.has(id)) {
      this.stopJob(id);
    }

    // Validate cron expression format on registration
    isCronMatch(cronExpression, new Date());

    let lastCheckedMinute = -1;

    const timer = setInterval(async () => {
      const now = new Date();
      const currentMinute = now.getMinutes();

      // Avoid double-execution within the same minute
      if (currentMinute === lastCheckedMinute) {
        return;
      }

      if (isCronMatch(cronExpression, now)) {
        lastCheckedMinute = currentMinute;
        const job = this.jobs.get(id);
        if (job) {
          job.lastRunAt = now.toISOString();
          job.runCount++;
        }

        try {
          await handler();
        } catch (err) {
          console.error(`[SCHEDULE_ERROR] Job '${id}' execution failed:`, err);
        }
      }
    }, checkIntervalMs);

    this.jobs.set(id, {
      cronExpression,
      handler,
      timer,
      running: true,
      runCount: 0,
    });

    return {
      stop: () => this.stopJob(id),
    };
  }

  stopJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    clearInterval(job.timer);
    job.running = false;
    this.jobs.delete(id);
    return true;
  }

  stopAll(): void {
    for (const job of this.jobs.values()) {
      clearInterval(job.timer);
      job.running = false;
    }
    this.jobs.clear();
  }

  hasJob(id: string): boolean {
    return this.jobs.has(id);
  }

  getActiveJobs(): ScheduledJobInfo[] {
    return Array.from(this.jobs.entries()).map(([id, job]) => ({
      id,
      cronExpression: job.cronExpression,
      running: job.running,
      lastRunAt: job.lastRunAt,
      runCount: job.runCount,
    }));
  }
}
