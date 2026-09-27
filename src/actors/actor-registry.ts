/**
 * Registry for scraping actors.
 */

import type { ActorType, IActor } from "../api/types";
import { ApiExtractorActor } from "./api-extractor-actor";
import { ArchiveExtractorActor } from "./archive-extractor-actor";
import { ArxivActor } from "./arxiv-actor";
import { CheerioScraperActor } from "./cheerio-scraper-actor";
import { ClinicalTrialsActor } from "./clinical-trials-actor";
import { CourtListenerActor } from "./court-listener-actor";
import { CrawlerActor } from "./crawler-actor";
import { DergiParkActor } from "./dergipark-actor";
import { DocumentExtractorActor } from "./document-extractor-actor";
import { EpubExtractorActor } from "./epub-extractor-actor";
import { EurLexActor } from "./eur-lex-actor";
import { EuropePmcActor } from "./europe-pmc-actor";
import { GutenbergActor } from "./gutenberg-actor";
import { IetfRfcActor } from "./ietf-rfc-actor";
import { InternetArchiveActor } from "./internet-archive-actor";
import { KtbEkitapActor } from "./ktb-ekitap-actor";
import { MarkdownReaderActor } from "./markdown-reader-actor";
import { MitOcwActor } from "./mit-ocw-actor";
import { NetworkInterceptorActor } from "./network-interceptor-actor";
import { OpenFdaActor } from "./open-fda-actor";
import { OpenAlexActor } from "./openalex-actor";
import { OpenStaxActor } from "./openstax-actor";
import { PdfDocumentActor } from "./pdf-document-actor";
import { PlaywrightBrowserActor } from "./playwright-browser-actor";
import { SaglikEkutuphaneActor } from "./saglik-ekutuphane-actor";
import { SecEdgarActor } from "./sec-edgar-actor";
import { SerpSearchActor } from "./serp-search-actor";
import { SitemapXmlActor } from "./sitemap-xml-actor";
import { SoftwareHeritageActor } from "./software-heritage-actor";
import { StackExchangeActor } from "./stack-exchange-actor";
import { WikimediaActor } from "./wikimedia-actor";

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
  registry.register(new PdfDocumentActor());
  registry.register(new ArxivActor());
  registry.register(new WikimediaActor());
  registry.register(new OpenAlexActor());
  registry.register(new StackExchangeActor());
  registry.register(new GutenbergActor());
  registry.register(new EuropePmcActor());
  registry.register(new IetfRfcActor());
  registry.register(new SaglikEkutuphaneActor());
  registry.register(new KtbEkitapActor());
  registry.register(new DocumentExtractorActor());
  registry.register(new ArchiveExtractorActor());
  registry.register(new EpubExtractorActor());
  registry.register(new DergiParkActor());
  registry.register(new InternetArchiveActor());
  registry.register(new ClinicalTrialsActor());
  registry.register(new OpenFdaActor());
  registry.register(new SecEdgarActor());
  registry.register(new CourtListenerActor());
  registry.register(new SoftwareHeritageActor());
  registry.register(new EurLexActor());
  registry.register(new OpenStaxActor());
  registry.register(new MitOcwActor());
  return registry;
}
