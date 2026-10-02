/**
 * Registry for scraping actors.
 */

import type { ActorType, IActor } from "../api/types";
// corpus: LLM training data source actors
import { AnayasaMahkemesiActor } from "./corpus/anayasa-mahkemesi-actor";
import { ArxivActor } from "./corpus/arxiv-actor";
import { ClinicalTrialsActor } from "./corpus/clinical-trials-actor";
import { CodeEvalActor } from "./corpus/code-eval-actor";
import { CourtListenerActor } from "./corpus/court-listener-actor";
import { DanistayActor } from "./corpus/danistay-actor";
import { DergiParkActor } from "./corpus/dergipark-actor";
import { DevDocsActor } from "./corpus/devdocs-actor";
import { EurLexActor } from "./corpus/eur-lex-actor";
import { EuropePmcActor } from "./corpus/europe-pmc-actor";
import { GithubActor } from "./corpus/github-actor";
import { GooglePatentsActor } from "./corpus/google-patents-actor";
import { GutenbergActor } from "./corpus/gutenberg-actor";
import { HackerNewsActor } from "./corpus/hacker-news-actor";
import { HuggingFaceDatasetsActor } from "./corpus/huggingface-datasets-actor";
import { IetfRfcActor } from "./corpus/ietf-rfc-actor";
import { InstagramActor } from "./corpus/instagram-actor";
import { InternetArchiveActor } from "./corpus/internet-archive-actor";
import { InternetPhilActor } from "./corpus/internet-phil-actor";
import { KapActor } from "./corpus/kap-actor";
import { KtbEkitapActor } from "./corpus/ktb-ekitap-actor";
import { LeanMathlibActor } from "./corpus/lean-mathlib-actor";
import { LessWrongActor } from "./corpus/lesswrong-actor";
import { LibreTextsActor } from "./corpus/libretexts-actor";
import { MathReasoningActor } from "./corpus/math-reasoning-actor";
import { MetamathActor } from "./corpus/metamath-actor";
import { MitOcwActor } from "./corpus/mit-ocw-actor";
import { OpenFdaActor } from "./corpus/open-fda-actor";
import { OpenTextbookActor } from "./corpus/open-textbook-actor";
import { OpenAlexActor } from "./corpus/openalex-actor";
import { OpenReviewActor } from "./corpus/openreview-actor";
import { OpenStaxActor } from "./corpus/openstax-actor";
import { PapersWithCodeActor } from "./corpus/papers-with-code-actor";
import { PerseusDlActor } from "./corpus/perseus-dl-actor";
import { PhilPapersActor } from "./corpus/philpapers-actor";
import { ProofWikiActor } from "./corpus/proofwiki-actor";
import { PubmedActor } from "./corpus/pubmed-actor";
import { ResmiGazeteActor } from "./corpus/resmi-gazete-actor";
import { RosettaCodeActor } from "./corpus/rosetta-code-actor";
import { SacredTextsActor } from "./corpus/sacred-texts-actor";
import { SaglikEkutuphaneActor } from "./corpus/saglik-ekutuphane-actor";
import { SecEdgarActor } from "./corpus/sec-edgar-actor";
import { SemanticScholarActor } from "./corpus/semantic-scholar-actor";
import { SoftwareHeritageActor } from "./corpus/software-heritage-actor";
import { StackExchangeActor } from "./corpus/stack-exchange-actor";
import { StanfordPhilActor } from "./corpus/stanford-phil-actor";
import { WikibooksActor } from "./corpus/wikibooks-actor";
import { WikidataActor } from "./corpus/wikidata-actor";
import { WikinewsActor } from "./corpus/wikinews-actor";
import { WikimediaActor, WikipediaActor } from "./corpus/wikipedia-actor";
import { WikiquoteActor } from "./corpus/wikiquote-actor";
import { WikisourceActor } from "./corpus/wikisource-actor";
import { WikispeciesActor } from "./corpus/wikispecies-actor";
import { WikiversityActor } from "./corpus/wikiversity-actor";
import { WikivoyageActor } from "./corpus/wikivoyage-actor";
import { WiktionaryActor } from "./corpus/wiktionary-actor";
import { YargitayActor } from "./corpus/yargitay-actor";
import { YoutubeTranscriptsActor } from "./corpus/youtube-transcripts-actor";

// documents: local file and archive extraction actors
import { ArchiveExtractorActor } from "./documents/archive-extractor-actor";
import { DocumentExtractorActor } from "./documents/document-extractor-actor";
import { EpubExtractorActor } from "./documents/epub-extractor-actor";
import { PdfDocumentActor } from "./documents/pdf-document-actor";
// web: general-purpose web extraction actors
import { ApiExtractorActor } from "./web/api-extractor-actor";
import { CheerioScraperActor } from "./web/cheerio-scraper-actor";
import { CrawlerActor } from "./web/crawler-actor";
import { MarkdownReaderActor } from "./web/markdown-reader-actor";
import { NetworkInterceptorActor } from "./web/network-interceptor-actor";
import { PlaywrightBrowserActor } from "./web/playwright-browser-actor";
import { SerpSearchActor } from "./web/serp-search-actor";
import { SitemapXmlActor } from "./web/sitemap-xml-actor";

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
  registry.register(new WikipediaActor());
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
  registry.register(new ResmiGazeteActor());
  registry.register(new YargitayActor());
  registry.register(new KapActor());
  registry.register(new GithubActor());
  registry.register(new HackerNewsActor());
  registry.register(new HuggingFaceDatasetsActor());
  registry.register(new MathReasoningActor());
  registry.register(new CodeEvalActor());
  registry.register(new ProofWikiActor());
  registry.register(new LeanMathlibActor());
  registry.register(new LessWrongActor());
  registry.register(new OpenReviewActor());
  registry.register(new YoutubeTranscriptsActor());
  registry.register(new WikisourceActor());
  registry.register(new WiktionaryActor());
  registry.register(new WikiquoteActor());
  registry.register(new WikibooksActor());
  registry.register(new WikiversityActor());
  registry.register(new WikivoyageActor());
  registry.register(new WikinewsActor());
  registry.register(new WikispeciesActor());
  registry.register(new WikidataActor());
  registry.register(new StanfordPhilActor());
  registry.register(new InternetPhilActor());
  registry.register(new MetamathActor());
  registry.register(new PhilPapersActor());
  registry.register(new DevDocsActor());
  registry.register(new RosettaCodeActor());
  registry.register(new PapersWithCodeActor());
  registry.register(new LibreTextsActor());
  registry.register(new OpenTextbookActor());
  registry.register(new SemanticScholarActor());
  registry.register(new AnayasaMahkemesiActor());
  registry.register(new DanistayActor());
  registry.register(new GooglePatentsActor());
  registry.register(new PerseusDlActor());
  registry.register(new SacredTextsActor());
  registry.register(new InstagramActor());
  registry.register(new PubmedActor());
  return registry;
}
