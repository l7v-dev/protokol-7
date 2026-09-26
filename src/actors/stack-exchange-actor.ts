/**
 * StackExchangeActor - Technical and algorithmic reasoning extraction actor.
 * Queries official Stack Exchange API v2.3 across network sites (Stack Overflow, Math, Physics, etc.),
 * filters by community score and acceptance status, and extracts structured (prompt, completion) instruction pairs.
 */

import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  StackExchangeActorResult,
  StackExchangeActorTaskOptions,
  StackExchangeAnswerItem,
  StackExchangeQuestionItem,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SITE = "stackoverflow";
const STACK_API_BASE = "https://api.stackexchange.com/2.3";

interface RawQuestion {
  question_id: number;
  title: string;
  body?: string;
  body_markdown?: string;
  score: number;
  tags?: string[];
  link: string;
  is_answered: boolean;
  accepted_answer_id?: number;
  answer_count?: number;
}

interface RawAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted?: boolean;
  body?: string;
  body_markdown?: string;
  owner?: { display_name?: string };
  creation_date: number;
}

export class StackExchangeActor implements IActor<StackExchangeActorResult> {
  readonly actorType = "stack-exchange" as const;
  readonly description =
    "Queries official Stack Exchange API v2.3 for verified algorithmic and technical Q&A pairs, filtered by score and acceptance.";

  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });
    this.turndown.remove(["script", "style", "noscript"]);
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<StackExchangeActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: StackExchangeActorTaskOptions = task.options?.stackExchangeOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
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
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const site = options.site || DEFAULT_SITE;
      const resolvedQueryUrl = this.buildSearchUrl(task.targetUrl, options, site);

      // 2. SSRF validation on primary search URL
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(resolvedQueryUrl, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 2. Fetch questions from Stack Exchange API
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; stack-exchange-actor)",
            Accept: "application/json, */*",
          },
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Stack Exchange API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const searchJson = (await response.json()) as {
        items?: RawQuestion[];
        has_more?: boolean;
        total?: number;
      };

      const rawQuestions = searchJson.items || [];
      const hasMore = Boolean(searchJson.has_more);

      if (rawQuestions.length === 0) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: response.status,
          data: {
            site,
            totalItems: 0,
            hasMore: false,
            questions: [],
            queryUrl: resolvedQueryUrl,
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Collect question IDs to fetch high-signal answers
      let baseApiUrl = STACK_API_BASE;
      try {
        const parsed = new URL(resolvedQueryUrl);
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
          baseApiUrl = `${parsed.origin}/2.3`;
        }
      } catch {
        // Use default
      }

      const questionIds = rawQuestions.map((q) => q.question_id);
      const answersMap = await this.fetchAnswersForQuestions(
        questionIds,
        site,
        options.apiKey,
        timeoutMs,
        allowLocalNetwork,
        baseApiUrl
      );

      // 4. Construct questions with markdown and instruction pairs
      const questions: StackExchangeQuestionItem[] = rawQuestions.map((raw) => {
        const questionMarkdown =
          raw.body_markdown || (raw.body ? this.turndown.turndown(raw.body) : "");
        const rawAnswers = answersMap.get(raw.question_id) || [];

        const answers: StackExchangeAnswerItem[] = rawAnswers.map((a) => ({
          answerId: a.answer_id,
          score: a.score,
          isAccepted: Boolean(a.is_accepted || a.answer_id === raw.accepted_answer_id),
          bodyMarkdown: a.body_markdown || (a.body ? this.turndown.turndown(a.body) : ""),
          authorName: a.owner?.display_name,
          creationDate: a.creation_date,
        }));

        // Identify accepted or highest scoring answer for instruction-tuning pair
        const acceptedAnswer = answers.find((a) => a.isAccepted) || answers[0];
        let instructionPair: { prompt: string; completion: string } | undefined;

        if (acceptedAnswer?.bodyMarkdown) {
          instructionPair = {
            prompt: `### Problem:\n${raw.title}\n\n${questionMarkdown}`.trim(),
            completion: `### Solution:\n${acceptedAnswer.bodyMarkdown}`.trim(),
          };
        }

        return {
          questionId: raw.question_id,
          title: raw.title,
          bodyMarkdown: questionMarkdown,
          score: raw.score,
          tags: raw.tags || [],
          link: raw.link,
          isAnswered: raw.is_answered,
          acceptedAnswerId: raw.accepted_answer_id,
          answers,
          instructionPair,
        };
      });

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          site,
          totalItems: questions.length,
          hasMore,
          questions,
          queryUrl: resolvedQueryUrl,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: msg,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetches top answers for a batch of question IDs.
   */
  private async fetchAnswersForQuestions(
    questionIds: number[],
    site: string,
    apiKey: string | undefined,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    baseApiUrl: string = STACK_API_BASE
  ): Promise<Map<number, RawAnswer[]>> {
    const map = new Map<number, RawAnswer[]>();
    if (questionIds.length === 0) return map;

    try {
      const idsJoined = questionIds.slice(0, 30).join(";");
      const url = new URL(`${baseApiUrl}/questions/${idsJoined}/answers`);
      url.searchParams.set("site", site);
      url.searchParams.set("order", "desc");
      url.searchParams.set("sort", "votes");
      url.searchParams.set("filter", "withbody");
      url.searchParams.set("pagesize", "50");

      if (apiKey) {
        url.searchParams.set("key", apiKey);
      }

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(url.toString(), {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) return map;

      const response = await safeRedirectFetch(url.toString(), {
        timeoutMs,
        allowLocalNetwork,
        headers: {
          "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; stack-exchange-actor)",
          Accept: "application/json, */*",
        },
      });

      if (response.ok) {
        const json = (await response.json()) as { items?: RawAnswer[] };
        for (const item of json.items || []) {
          const list = map.get(item.question_id) || [];
          list.push(item);
          map.set(item.question_id, list);
        }
      }
    } catch {
      // Graceful degradation: return questions without child answers if secondary query fails
    }

    return map;
  }

  /**
   * Builds the Stack Exchange query URL.
   */
  private buildSearchUrl(
    targetUrl: string | undefined,
    options: StackExchangeActorTaskOptions,
    site: string
  ): string {
    let baseEndpoint = `${STACK_API_BASE}/search/advanced`;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.hostname.includes("stackexchange.com") ||
          parsed.hostname.includes("stackoverflow.com") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Fallback to default
      }
    }

    const url = new URL(baseEndpoint);
    url.searchParams.set("site", site);
    url.searchParams.set("filter", "withbody");
    url.searchParams.set("order", options.order || "desc");
    url.searchParams.set("sort", options.sort || "votes");

    if (options.query) {
      url.searchParams.set("q", options.query);
    }

    if (options.tagged) {
      url.searchParams.set("tagged", options.tagged);
    }

    if (options.acceptedOnly) {
      url.searchParams.set("accepted", "True");
    }

    if (options.minScore !== undefined && options.minScore > 0) {
      url.searchParams.set("min", String(options.minScore));
    }

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    url.searchParams.set("pagesize", String(Math.min(100, Math.max(1, pageSize))));

    if (options.page && options.page > 1) {
      url.searchParams.set("page", String(options.page));
    }

    if (options.apiKey) {
      url.searchParams.set("key", options.apiKey);
    }

    return url.toString();
  }
}
