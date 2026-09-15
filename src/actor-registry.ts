/**
 * Registry for scraping actors.
 */

import { ApiExtractorActor } from "./api-extractor-actor";
import { CheerioScraperActor } from "./cheerio-scraper-actor";
import { CrawlerActor } from "./crawler-actor";
import { MarkdownReaderActor } from "./markdown-reader-actor";
import { NetworkInterceptorActor } from "./network-interceptor-actor";
import { PlaywrightBrowserActor } from "./playwright-browser-actor";
import { SerpSearchActor } from "./serp-search-actor";
import { SitemapXmlActor } from "./sitemap-xml-actor";
import { ActorType, IActor } from "./types";

export class ActorRegistry {
  private readonly actors = new Map<ActorType, IActor<unknown>>();

  register(actor: IActor<unknown>): void {
    this.actors.set(actor.actorType, actor);
  }

  get<T = unknown>(type: ActorType): IActor<T> | undefined {
    return this.actors.get(type) as IActor<T> | undefined;
  }

  has(type: ActorType): boolean {
    return this.actors.has(type);
  }

  list(): IActor<unknown>[] {
    return Array.from(this.actors.values());
  }
}

export function createDefaultActorRegistry(): ActorRegistry {
  const registry = new ActorRegistry();
  registry.register(new CheerioScraperActor());
  registry.register(new PlaywrightBrowserActor());
  registry.register(new ApiExtractorActor());
  registry.register(new CrawlerActor());
  registry.register(new SitemapXmlActor());
  registry.register(new MarkdownReaderActor());
  registry.register(new NetworkInterceptorActor());
  registry.register(new SerpSearchActor());
  return registry;
}
