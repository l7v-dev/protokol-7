/**
 * src/actors/mit-ocw-actor.ts
 *
 * MIT OpenCourseWare (MIT OCW) Harvester.
 * Fetches undergraduate and graduate university curriculum materials, syllabi,
 * course topics, lecture descriptions, and instructor metadata from MIT OCW.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  MitOcwActorResult,
  MitOcwActorTaskOptions,
  MitOcwCourseItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIT_SEARCH_ENDPOINT = "https://open.mit.edu/api/v0/search/";
const OCW_BASE_URL = "https://ocw.mit.edu";

interface RawInstructorItem {
  title?: string;
  first_name?: string;
  last_name?: string;
}

interface RawRunItem {
  id?: number;
  slug?: string;
  semester?: string;
  year?: number;
  level?: string[];
  instructors?: string[];
  short_description?: string;
}

interface RawSearchHitSource {
  id?: string | number;
  title?: string;
  coursenum?: string;
  course_id?: string;
  short_description?: string;
  department_name?: string;
  topics?: string[];
  platform?: string;
  runs?: RawRunItem[];
}

interface RawSearchResponse {
  hits?: {
    total?: {
      value?: number;
    };
    hits?: Array<{
      _id?: string;
      _source?: RawSearchHitSource;
    }>;
  };
}

interface RawCourseDataJson {
  course_title?: string;
  title?: string;
  primary_course_number?: string;
  course_description?: string;
  level?: string[];
  department?: string;
  term?: string;
  year?: string | number;
  topics?: Array<string[] | string>;
  instructors?: RawInstructorItem[];
  learning_resource_types?: string[];
  site_url_path?: string;
}

export class MitOcwActor implements IActor<MitOcwActorResult> {
  readonly actorType = "mit-ocw" as const;
  readonly description =
    "Queries MIT OpenCourseWare for university curriculum materials, syllabi, lecture metadata, and course resources.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<MitOcwActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: MitOcwActorTaskOptions = task.options?.mitOcwOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            errorMessage: `SSRF validation failed for targetUrl: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const action = options.action || (options.courseSlug ? "course" : "search");

      if (action === "course" && options.courseSlug) {
        return await this.fetchCourseDetail(task, options, startTime, timeoutMs, allowLocalNetwork);
      }

      return await this.searchCourses(task, options, startTime, timeoutMs, allowLocalNetwork);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `MIT OpenCourseWare extraction failed: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async searchCourses(
    task: ActorTask,
    options: MitOcwActorTaskOptions,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<MitOcwActorResult>> {
    const limit = Math.min(Math.max(1, options.limit || DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Math.max(0, options.offset || 0);
    const searchQuery = options.query?.trim();

    const boolMust: Record<string, unknown>[] = [{ term: { offered_by: "OCW" } }];

    if (searchQuery) {
      boolMust.push({
        multi_match: {
          query: searchQuery,
          fields: ["title^3", "short_description^2", "course_id", "coursenum"],
        },
      });
    }

    const payload = {
      from: offset,
      size: limit,
      query: {
        bool: {
          must: boolMust,
        },
      },
    };

    const isHttpUrl = Boolean(
      task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
    );
    const queryUrl = isHttpUrl ? task.targetUrl : MIT_SEARCH_ENDPOINT;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation blocked MIT search request: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(queryUrl, {
      method: "POST",
      timeoutMs,
      allowLocalNetwork,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7/1.0; +https://github.com/protokol-7)",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `MIT search API returned HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const rawData = (await response.json()) as RawSearchResponse;
    const hits = rawData.hits?.hits || [];
    const totalCount = rawData.hits?.total?.value ?? hits.length;

    const courses: MitOcwCourseItem[] = hits.map((hit) => {
      const src = hit._source || {};
      const run = src.runs?.[0];
      const rawSlug = run?.slug || "";
      const cleanSlug = rawSlug.startsWith("/") ? rawSlug.slice(1) : rawSlug;
      const url = cleanSlug
        ? `${OCW_BASE_URL}/${cleanSlug}/`
        : `${OCW_BASE_URL}/courses/${src.course_id || ""}`;

      const rawDesc = run?.short_description || src.short_description || "";
      const cleanDesc = rawDesc
        .replace(/<[^>]+>/g, "")
        .replace(/\[_?([^\]]+)_?\]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: String(src.id || hit._id || ""),
        courseNumber: src.coursenum,
        title: src.title || "Untitled Course",
        description: cleanDesc,
        level: run?.level,
        topics: src.topics,
        instructors: run?.instructors,
        department: src.department_name,
        year: run?.year,
        semester: run?.semester,
        url,
        platform: src.platform || "ocw",
      };
    });

    const markdown = this.renderCoursesMarkdown(courses, searchQuery, totalCount);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: response.status,
      executionDurationMs: Date.now() - startTime,
      data: {
        query: searchQuery,
        action: "search",
        totalCount,
        courses,
        markdown,
        queryUrl,
      },
    };
  }

  private async fetchCourseDetail(
    task: ActorTask,
    options: MitOcwActorTaskOptions,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<MitOcwActorResult>> {
    const rawSlug = (options.courseSlug || "").replace(/^\/+|\/+$/g, "");
    const cleanSlug = rawSlug.startsWith("courses/") ? rawSlug.slice("courses/".length) : rawSlug;

    const endpoint = `${OCW_BASE_URL}/courses/${cleanSlug}/data.json`;
    const isHttpUrl = Boolean(
      task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
    );
    const queryUrl = isHttpUrl ? task.targetUrl : endpoint;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation blocked MIT course detail request: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(queryUrl, {
      timeoutMs,
      allowLocalNetwork,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7/1.0; +https://github.com/protokol-7)",
      },
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `MIT course detail returned HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const data = (await response.json()) as RawCourseDataJson;
    const title = data.course_title || data.title || "Untitled Course";
    const rawDesc = data.course_description || "";
    const cleanDesc = rawDesc
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const instructorNames: string[] = (data.instructors || [])
      .map((i) => i.title || `${i.first_name || ""} ${i.last_name || ""}`.trim())
      .filter(Boolean);

    const flattenedTopics: string[] = [];
    if (Array.isArray(data.topics)) {
      for (const t of data.topics) {
        if (Array.isArray(t)) {
          flattenedTopics.push(t.join(" > "));
        } else if (typeof t === "string") {
          flattenedTopics.push(t);
        }
      }
    }

    const courseItem: MitOcwCourseItem = {
      id: cleanSlug,
      courseNumber: data.primary_course_number,
      title,
      description: cleanDesc,
      level: data.level,
      topics: flattenedTopics,
      instructors: instructorNames,
      department: data.department,
      year: data.year,
      semester: data.term,
      url: `${OCW_BASE_URL}/courses/${cleanSlug}/`,
      platform: "ocw",
    };

    const markdown = this.renderCourseDetailMarkdown(courseItem, data);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: response.status,
      executionDurationMs: Date.now() - startTime,
      data: {
        query: options.query,
        courseSlug: cleanSlug,
        action: "course",
        totalCount: 1,
        courses: [courseItem],
        courseDetail: data as unknown as Record<string, unknown>,
        markdown,
        queryUrl,
      },
    };
  }

  private renderCoursesMarkdown(
    courses: MitOcwCourseItem[],
    query: string | undefined,
    totalCount: number
  ): string {
    const lines: string[] = [];
    lines.push("# MIT OpenCourseWare Search");
    lines.push("");
    if (query) {
      lines.push(`**Query**: \`${query}\``);
    }
    lines.push(`**Total Results**: ${totalCount}`);
    lines.push(`**Returned Courses**: ${courses.length}`);
    lines.push("");

    if (courses.length === 0) {
      lines.push("No MIT OCW courses found matching query.");
      return lines.join("\n");
    }

    lines.push("| Course # | Title | Level | Term | Instructors | URL |");
    lines.push("|---|---|---|---|---|---|");

    for (const c of courses) {
      const num = c.courseNumber || "N/A";
      const lvl = c.level?.join(", ") || "N/A";
      const term = [c.semester, c.year].filter(Boolean).join(" ") || "N/A";
      const inst = c.instructors?.slice(0, 2).join("; ") || "MIT Faculty";
      const link = `[Course Link](${c.url})`;
      lines.push(`| \`${num}\` | **${c.title}** | ${lvl} | ${term} | ${inst} | ${link} |`);
    }

    lines.push("");
    lines.push("## Course Descriptions");
    lines.push("");

    for (const c of courses) {
      lines.push(`### ${c.title} (${c.courseNumber || "OCW"})`);
      lines.push(`- **URL**: ${c.url}`);
      if (c.level?.length) {
        lines.push(`- **Level**: ${c.level.join(", ")}`);
      }
      if (c.instructors?.length) {
        lines.push(`- **Instructors**: ${c.instructors.join(", ")}`);
      }
      if (c.topics?.length) {
        lines.push(`- **Topics**: ${c.topics.join(", ")}`);
      }
      if (c.description) {
        lines.push(`- **Overview**: ${c.description}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderCourseDetailMarkdown(course: MitOcwCourseItem, data: RawCourseDataJson): string {
    const lines: string[] = [];
    lines.push(`# ${course.title} (${course.courseNumber || "MIT OCW"})`);
    lines.push("");
    lines.push(`- **Course URL**: [${course.url}](${course.url})`);
    if (course.courseNumber) {
      lines.push(`- **Course Number**: \`${course.courseNumber}\``);
    }
    if (course.level?.length) {
      lines.push(`- **Academic Level**: ${course.level.join(", ")}`);
    }
    if (course.semester || course.year) {
      lines.push(`- **Term**: ${[course.semester, course.year].filter(Boolean).join(" ")}`);
    }
    if (course.instructors?.length) {
      lines.push(`- **Instructors**: ${course.instructors.join(", ")}`);
    }
    if (course.topics?.length) {
      lines.push(`- **Topics**: ${course.topics.join(", ")}`);
    }
    if (data.learning_resource_types?.length) {
      lines.push(`- **Resource Types**: ${data.learning_resource_types.join(", ")}`);
    }
    lines.push("");
    lines.push("## Course Description & Syllabus");
    lines.push("");
    lines.push(course.description || "No description provided.");
    lines.push("");

    return lines.join("\n");
  }
}
