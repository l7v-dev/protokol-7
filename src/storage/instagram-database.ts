/**
 * SQLite Relational Database Engine for Instagram Harvester.
 * Provides ACID persistence for Instagram Profiles, Posts, Slides, Comments,
 * Hashtags, Mentions, Historical Snapshots, and Audit Run Logs using native node:sqlite.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  InstagramActorResult,
  InstagramCommentRecord,
  InstagramHashtagRecord,
  InstagramMediaChild,
  InstagramMediaRecord,
  InstagramMediaType,
  InstagramProfileRecord,
} from "../api/types";

export interface InstagramDatabaseOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export interface InstagramHarvestRunRecord {
  runId: string;
  targetType: string;
  targetQuery: string;
  engineUsed: string;
  status: "success" | "failed";
  itemsHarvested: number;
  commentsHarvested: number;
  durationMs: number;
  errorMessage?: string;
  createdAt: number;
}

export interface InstagramDatabaseStats {
  profileCount: number;
  postCount: number;
  slideCount: number;
  commentCount: number;
  hashtagCount: number;
  snapshotCount: number;
  harvestRunCount: number;
}

export class InstagramDatabase {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;
  private readonly isMemory: boolean;

  // Prepared statements
  private stmtUpsertProfile!: StatementSync;
  private stmtGetProfileByUsername!: StatementSync;
  private stmtGetProfileById!: StatementSync;
  private stmtInsertSnapshot!: StatementSync;
  private stmtListSnapshotsByProfileId!: StatementSync;

  private stmtUpsertPost!: StatementSync;
  private stmtGetPostByShortcode!: StatementSync;
  private stmtListPostsByOwner!: StatementSync;
  private stmtListAllPosts!: StatementSync;

  private stmtUpsertSlide!: StatementSync;
  private stmtListSlidesByPostShortcode!: StatementSync;

  private stmtUpsertComment!: StatementSync;
  private stmtListCommentsByPostShortcode!: StatementSync;

  private stmtUpsertHashtag!: StatementSync;
  private stmtUpsertPostHashtag!: StatementSync;
  private stmtListHashtagsByPostShortcode!: StatementSync;

  private stmtUpsertPostMention!: StatementSync;
  private stmtListMentionsByPostShortcode!: StatementSync;

  private stmtInsertHarvestRun!: StatementSync;
  private stmtListHarvestRuns!: StatementSync;

  private stmtUpdatePostLocalPath!: StatementSync;
  private stmtUpdateSlideLocalPath!: StatementSync;

  constructor(options?: InstagramDatabaseOptions) {
    const isTest = process.env.NODE_ENV === "test";
    this.isMemory =
      options?.inMemory ?? (options?.dbPath === ":memory:" || (isTest && !options?.dbPath));
    this.dbPath = this.isMemory
      ? ":memory:"
      : options?.dbPath || process.env.INSTAGRAM_DB_PATH || "data/catalogs/instagram.sqlite";

    if (!this.isMemory) {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initDatabase();
    this.prepareStatements();
  }

  private initDatabase(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this.db.exec(`
      -- 1. Profiles Table
      CREATE TABLE IF NOT EXISTS instagram_profiles (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        full_name TEXT,
        biography TEXT,
        external_url TEXT,
        profile_pic_url TEXT,
        profile_pic_url_hd TEXT,
        is_verified INTEGER DEFAULT 0,
        is_private INTEGER DEFAULT 0,
        is_business_account INTEGER DEFAULT 0,
        category_name TEXT,
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        media_count INTEGER DEFAULT 0,
        raw_json TEXT,
        first_scraped_at INTEGER NOT NULL,
        last_scraped_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ig_profiles_username ON instagram_profiles(username);

      -- 2. Profile Historical Growth Snapshots
      CREATE TABLE IF NOT EXISTS instagram_profile_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        media_count INTEGER DEFAULT 0,
        captured_at INTEGER NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES instagram_profiles(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ig_snapshots_profile ON instagram_profile_snapshots(profile_id, captured_at DESC);

      -- 3. Posts & Media Table
      CREATE TABLE IF NOT EXISTS instagram_posts (
        id TEXT PRIMARY KEY,
        shortcode TEXT UNIQUE NOT NULL,
        owner_id TEXT,
        owner_username TEXT NOT NULL,
        media_type TEXT NOT NULL,
        product_type TEXT,
        caption TEXT,
        taken_at INTEGER,
        display_url TEXT,
        video_url TEXT,
        video_duration REAL,
        video_view_count INTEGER,
        video_play_count INTEGER,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        location_id TEXT,
        location_name TEXT,
        location_slug TEXT,
        music_artist TEXT,
        music_title TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_paid_partnership INTEGER DEFAULT 0,
        raw_json TEXT,
        local_path TEXT,
        first_scraped_at INTEGER NOT NULL,
        last_scraped_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ig_posts_shortcode ON instagram_posts(shortcode);
      CREATE INDEX IF NOT EXISTS idx_ig_posts_owner ON instagram_posts(owner_username);
      CREATE INDEX IF NOT EXISTS idx_ig_posts_taken_at ON instagram_posts(taken_at DESC);

      -- 4. Carousel Child Slides Table
      CREATE TABLE IF NOT EXISTS instagram_post_slides (
        id TEXT PRIMARY KEY,
        post_shortcode TEXT NOT NULL,
        slide_order INTEGER DEFAULT 0,
        media_type TEXT NOT NULL,
        display_url TEXT NOT NULL,
        video_url TEXT,
        width INTEGER,
        height INTEGER,
        raw_json TEXT,
        local_path TEXT,
        FOREIGN KEY (post_shortcode) REFERENCES instagram_posts(shortcode) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ig_slides_post ON instagram_post_slides(post_shortcode, slide_order ASC);

      -- 5. Comments Table
      CREATE TABLE IF NOT EXISTS instagram_comments (
        id TEXT PRIMARY KEY,
        post_shortcode TEXT NOT NULL,
        parent_comment_id TEXT,
        author_id TEXT,
        author_username TEXT NOT NULL,
        author_full_name TEXT,
        author_profile_pic_url TEXT,
        author_is_verified INTEGER DEFAULT 0,
        text TEXT NOT NULL,
        like_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        created_at INTEGER,
        raw_json TEXT,
        scraped_at INTEGER NOT NULL,
        FOREIGN KEY (post_shortcode) REFERENCES instagram_posts(shortcode) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ig_comments_post ON instagram_comments(post_shortcode, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ig_comments_author ON instagram_comments(author_username);

      -- 6. Hashtags Directory Table
      CREATE TABLE IF NOT EXISTS instagram_hashtags (
        name TEXT PRIMARY KEY,
        media_count INTEGER DEFAULT 0,
        last_scraped_at INTEGER NOT NULL
      );

      -- 7. Post-Hashtags Mapping Table
      CREATE TABLE IF NOT EXISTS instagram_post_hashtags (
        post_shortcode TEXT NOT NULL,
        hashtag TEXT NOT NULL,
        PRIMARY KEY (post_shortcode, hashtag),
        FOREIGN KEY (post_shortcode) REFERENCES instagram_posts(shortcode) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ig_post_hashtags_tag ON instagram_post_hashtags(hashtag);

      -- 8. Post-Mentions Mapping Table
      CREATE TABLE IF NOT EXISTS instagram_post_mentions (
        post_shortcode TEXT NOT NULL,
        mentioned_username TEXT NOT NULL,
        PRIMARY KEY (post_shortcode, mentioned_username),
        FOREIGN KEY (post_shortcode) REFERENCES instagram_posts(shortcode) ON DELETE CASCADE
      );

      -- 9. Harvest Runs Audit Table
      CREATE TABLE IF NOT EXISTS instagram_harvest_runs (
        run_id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_query TEXT NOT NULL,
        engine_used TEXT NOT NULL,
        status TEXT NOT NULL,
        items_harvested INTEGER DEFAULT 0,
        comments_harvested INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ig_harvest_runs_created ON instagram_harvest_runs(created_at DESC);
    `);

    // 10. Schema migrations for local_path
    try {
      this.db.exec("ALTER TABLE instagram_posts ADD COLUMN local_path TEXT;");
    } catch {
      // Column already exists
    }
    try {
      this.db.exec("ALTER TABLE instagram_post_slides ADD COLUMN local_path TEXT;");
    } catch {
      // Column already exists
    }
  }

  private prepareStatements(): void {
    // 1. Profile statements
    this.stmtUpsertProfile = this.db.prepare(`
      INSERT INTO instagram_profiles (
        id, username, full_name, biography, external_url,
        profile_pic_url, profile_pic_url_hd, is_verified, is_private,
        is_business_account, category_name, follower_count, following_count,
        media_count, raw_json, first_scraped_at, last_scraped_at
      ) VALUES (
        $id, $username, $full_name, $biography, $external_url,
        $profile_pic_url, $profile_pic_url_hd, $is_verified, $is_private,
        $is_business_account, $category_name, $follower_count, $following_count,
        $media_count, $raw_json, $first_scraped_at, $last_scraped_at
      )
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        full_name = excluded.full_name,
        biography = excluded.biography,
        external_url = excluded.external_url,
        profile_pic_url = excluded.profile_pic_url,
        profile_pic_url_hd = excluded.profile_pic_url_hd,
        is_verified = excluded.is_verified,
        is_private = excluded.is_private,
        is_business_account = excluded.is_business_account,
        category_name = excluded.category_name,
        follower_count = excluded.follower_count,
        following_count = excluded.following_count,
        media_count = excluded.media_count,
        raw_json = COALESCE(excluded.raw_json, instagram_profiles.raw_json),
        last_scraped_at = excluded.last_scraped_at;
    `);

    this.stmtGetProfileByUsername = this.db.prepare(`
      SELECT * FROM instagram_profiles WHERE username = ?;
    `);

    this.stmtGetProfileById = this.db.prepare(`
      SELECT * FROM instagram_profiles WHERE id = ?;
    `);

    this.stmtInsertSnapshot = this.db.prepare(`
      INSERT INTO instagram_profile_snapshots (
        profile_id, follower_count, following_count, media_count, captured_at
      ) VALUES (?, ?, ?, ?, ?);
    `);

    this.stmtListSnapshotsByProfileId = this.db.prepare(`
      SELECT follower_count, following_count, media_count, captured_at
      FROM instagram_profile_snapshots
      WHERE profile_id = ?
      ORDER BY captured_at DESC
      LIMIT ?;
    `);

    // 2. Post statements
    this.stmtUpsertPost = this.db.prepare(`
      INSERT INTO instagram_posts (
        id, shortcode, owner_id, owner_username, media_type, product_type,
        caption, taken_at, display_url, video_url, video_duration,
        video_view_count, video_play_count, like_count, comment_count,
        location_id, location_name, location_slug, music_artist, music_title,
        is_pinned, is_paid_partnership, raw_json, first_scraped_at, last_scraped_at
      ) VALUES (
        $id, $shortcode, $owner_id, $owner_username, $media_type, $product_type,
        $caption, $taken_at, $display_url, $video_url, $video_duration,
        $video_view_count, $video_play_count, $like_count, $comment_count,
        $location_id, $location_name, $location_slug, $music_artist, $music_title,
        $is_pinned, $is_paid_partnership, $raw_json, $first_scraped_at, $last_scraped_at
      )
      ON CONFLICT(shortcode) DO UPDATE SET
        like_count = excluded.like_count,
        comment_count = excluded.comment_count,
        display_url = excluded.display_url,
        video_url = COALESCE(excluded.video_url, instagram_posts.video_url),
        video_view_count = COALESCE(excluded.video_view_count, instagram_posts.video_view_count),
        raw_json = COALESCE(excluded.raw_json, instagram_posts.raw_json),
        last_scraped_at = excluded.last_scraped_at;
    `);

    this.stmtGetPostByShortcode = this.db.prepare(`
      SELECT * FROM instagram_posts WHERE shortcode = ?;
    `);

    this.stmtListPostsByOwner = this.db.prepare(`
      SELECT * FROM instagram_posts WHERE owner_username = ? ORDER BY taken_at DESC LIMIT ? OFFSET ?;
    `);

    this.stmtListAllPosts = this.db.prepare(`
      SELECT * FROM instagram_posts ORDER BY taken_at DESC LIMIT ? OFFSET ?;
    `);

    this.stmtUpdatePostLocalPath = this.db.prepare(`
      UPDATE instagram_posts SET local_path = $local_path WHERE shortcode = $shortcode;
    `);

    // 3. Slide statements
    this.stmtUpsertSlide = this.db.prepare(`
      INSERT INTO instagram_post_slides (
        id, post_shortcode, slide_order, media_type, display_url, video_url, width, height, raw_json
      ) VALUES (
        $id, $post_shortcode, $slide_order, $media_type, $display_url, $video_url, $width, $height, $raw_json
      )
      ON CONFLICT(id) DO UPDATE SET
        display_url = excluded.display_url,
        video_url = excluded.video_url;
    `);

    this.stmtListSlidesByPostShortcode = this.db.prepare(`
      SELECT * FROM instagram_post_slides WHERE post_shortcode = ? ORDER BY slide_order ASC;
    `);

    this.stmtUpdateSlideLocalPath = this.db.prepare(`
      UPDATE instagram_post_slides SET local_path = $local_path WHERE id = $id;
    `);

    // 4. Comment statements
    this.stmtUpsertComment = this.db.prepare(`
      INSERT INTO instagram_comments (
        id, post_shortcode, parent_comment_id, author_id, author_username,
        author_full_name, author_profile_pic_url, author_is_verified, text,
        like_count, reply_count, created_at, raw_json, scraped_at
      ) VALUES (
        $id, $post_shortcode, $parent_comment_id, $author_id, $author_username,
        $author_full_name, $author_profile_pic_url, $author_is_verified, $text,
        $like_count, $reply_count, $created_at, $raw_json, $scraped_at
      )
      ON CONFLICT(id) DO UPDATE SET
        like_count = excluded.like_count,
        reply_count = excluded.reply_count,
        text = excluded.text;
    `);

    this.stmtListCommentsByPostShortcode = this.db.prepare(`
      SELECT * FROM instagram_comments WHERE post_shortcode = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;
    `);

    // 5. Hashtag statements
    this.stmtUpsertHashtag = this.db.prepare(`
      INSERT INTO instagram_hashtags (name, media_count, last_scraped_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        media_count = excluded.media_count,
        last_scraped_at = excluded.last_scraped_at;
    `);

    this.stmtUpsertPostHashtag = this.db.prepare(`
      INSERT OR IGNORE INTO instagram_post_hashtags (post_shortcode, hashtag) VALUES (?, ?);
    `);

    this.stmtListHashtagsByPostShortcode = this.db.prepare(`
      SELECT hashtag FROM instagram_post_hashtags WHERE post_shortcode = ?;
    `);

    // 6. Mention statements
    this.stmtUpsertPostMention = this.db.prepare(`
      INSERT OR IGNORE INTO instagram_post_mentions (post_shortcode, mentioned_username) VALUES (?, ?);
    `);

    this.stmtListMentionsByPostShortcode = this.db.prepare(`
      SELECT mentioned_username FROM instagram_post_mentions WHERE post_shortcode = ?;
    `);

    // 7. Audit log statements
    this.stmtInsertHarvestRun = this.db.prepare(`
      INSERT INTO instagram_harvest_runs (
        run_id, target_type, target_query, engine_used, status,
        items_harvested, comments_harvested, duration_ms, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    this.stmtListHarvestRuns = this.db.prepare(`
      SELECT * FROM instagram_harvest_runs ORDER BY created_at DESC LIMIT ?;
    `);
  }

  /**
   * Persists an Instagram profile and captures a historical snapshot.
   */
  upsertProfile(profile: InstagramProfileRecord, rawJson?: unknown): void {
    const now = Math.floor(Date.now() / 1000);
    const profileId = profile.id || profile.username;

    this.stmtUpsertProfile.run({
      $id: profileId,
      $username: profile.username,
      $full_name: profile.fullName || null,
      $biography: profile.biography || null,
      $external_url: profile.externalUrl || null,
      $profile_pic_url: profile.profilePicUrl || null,
      $profile_pic_url_hd: null,
      $is_verified: profile.isVerified ? 1 : 0,
      $is_private: profile.isPrivate ? 1 : 0,
      $is_business_account: 0,
      $category_name: null,
      $follower_count: profile.followerCount || 0,
      $following_count: profile.followingCount || 0,
      $media_count: profile.mediaCount || 0,
      $raw_json: rawJson ? JSON.stringify(rawJson) : null,
      $first_scraped_at: now,
      $last_scraped_at: now,
    });

    // Record historical growth snapshot
    this.stmtInsertSnapshot.run(
      profileId,
      profile.followerCount || 0,
      profile.followingCount || 0,
      profile.mediaCount || 0,
      now
    );
  }

  /**
   * Persists an Instagram post, along with slides, comments, hashtags, and mentions.
   */
  upsertPost(post: InstagramMediaRecord, ownerUsername?: string, rawJson?: unknown): void {
    const now = Math.floor(Date.now() / 1000);
    const resolvedOwner = ownerUsername || post.owner?.username || "unknown";

    this.stmtUpsertPost.run({
      $id: post.id || post.shortcode,
      $shortcode: post.shortcode,
      $owner_id: post.owner?.id || null,
      $owner_username: resolvedOwner,
      $media_type: post.mediaType,
      $product_type: post.mediaType === "video" ? "reel" : "feed",
      $caption: post.caption || null,
      $taken_at: post.takenAtTimestamp || null,
      $display_url: post.displayUrl || null,
      $video_url: post.videoUrl || null,
      $video_duration: null,
      $video_view_count: post.videoViewCount || null,
      $video_play_count: null,
      $like_count: post.likeCount || 0,
      $comment_count: post.commentCount || 0,
      $location_id: post.location?.id || null,
      $location_name: post.location?.name || null,
      $location_slug: post.location?.slug || null,
      $music_artist: null,
      $music_title: null,
      $is_pinned: 0,
      $is_paid_partnership: 0,
      $raw_json: rawJson ? JSON.stringify(rawJson) : null,
      $first_scraped_at: now,
      $last_scraped_at: now,
    });

    // Persist carousel child slides if present
    if (post.children && Array.isArray(post.children)) {
      post.children.forEach((slide, idx) => {
        this.stmtUpsertSlide.run({
          $id: slide.id || `${post.shortcode}-${idx}`,
          $post_shortcode: post.shortcode,
          $slide_order: idx,
          $media_type: slide.mediaType,
          $display_url: slide.displayUrl,
          $video_url: slide.videoUrl || null,
          $width: slide.dimensions?.width || null,
          $height: slide.dimensions?.height || null,
          $raw_json: null,
        });
      });
    }

    // Persist comments if present
    if (post.comments && Array.isArray(post.comments)) {
      for (const comment of post.comments) {
        this.upsertComment(comment, post.shortcode);
      }
    }

    // Persist hashtags
    if (post.hashtags && Array.isArray(post.hashtags)) {
      for (const tag of post.hashtags) {
        const cleanTag = tag.replace(/^#/, "");
        this.stmtUpsertHashtag.run(cleanTag, 0, now);
        this.stmtUpsertPostHashtag.run(post.shortcode, cleanTag);
      }
    }

    // Persist mentions
    if (post.mentions && Array.isArray(post.mentions)) {
      for (const mention of post.mentions) {
        const cleanMention = mention.replace(/^@/, "");
        this.stmtUpsertPostMention.run(post.shortcode, cleanMention);
      }
    }
  }

  /**
   * Persists an individual comment.
   */
  upsertComment(
    comment: InstagramCommentRecord,
    postShortcode: string,
    parentCommentId?: string,
    rawJson?: unknown
  ): void {
    const now = Math.floor(Date.now() / 1000);
    this.stmtUpsertComment.run({
      $id: comment.id,
      $post_shortcode: postShortcode,
      $parent_comment_id: parentCommentId || null,
      $author_id: null,
      $author_username: comment.username,
      $author_full_name: null,
      $author_profile_pic_url: comment.authorProfilePicUrl || null,
      $author_is_verified: comment.authorIsVerified ? 1 : 0,
      $text: comment.text,
      $like_count: comment.likeCount || 0,
      $reply_count: 0,
      $created_at: comment.createdAtTimestamp || null,
      $raw_json: rawJson ? JSON.stringify(rawJson) : null,
      $scraped_at: now,
    });
  }

  /**
   * Persists a hashtag and its associated top/recent posts.
   */
  upsertHashtag(hashtag: InstagramHashtagRecord): void {
    const now = Math.floor(Date.now() / 1000);
    this.stmtUpsertHashtag.run(hashtag.name, hashtag.mediaCount, now);

    const allPosts = [...(hashtag.topPosts || []), ...(hashtag.recentPosts || [])];
    for (const post of allPosts) {
      this.upsertPost(post, undefined);
    }
  }

  /**
   * Records a complete actor harvest run in an atomic ACID transaction.
   */
  saveActorResult(result: InstagramActorResult): {
    profilesSaved: number;
    postsSaved: number;
    commentsSaved: number;
  } {
    let profilesSaved = 0;
    let postsSaved = 0;
    let commentsSaved = 0;

    this.db.exec("BEGIN TRANSACTION;");
    try {
      if (result.profile) {
        this.upsertProfile(result.profile);
        profilesSaved++;

        if (result.profile.recentPostsPreview) {
          for (const post of result.profile.recentPostsPreview) {
            this.upsertPost(post, result.profile.username);
            postsSaved++;
            if (post.comments) {
              commentsSaved += post.comments.length;
            }
          }
        }
      }

      if (result.posts) {
        for (const post of result.posts) {
          this.upsertPost(post, result.profile?.username);
          postsSaved++;
          if (post.comments) {
            commentsSaved += post.comments.length;
          }
        }
      }

      if (result.hashtag) {
        this.upsertHashtag(result.hashtag);
      }

      this.db.exec("COMMIT;");
      return { profilesSaved, postsSaved, commentsSaved };
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Logs a completed or failed harvest run into the audit trail.
   */
  recordHarvestRun(run: InstagramHarvestRunRecord): void {
    this.stmtInsertHarvestRun.run(
      run.runId,
      run.targetType,
      run.targetQuery,
      run.engineUsed,
      run.status,
      run.itemsHarvested,
      run.commentsHarvested,
      run.durationMs,
      run.errorMessage ?? null,
      run.createdAt ?? Math.floor(Date.now() / 1000)
    );
  }

  // --- QUERY METHODS ---

  getProfile(username: string): InstagramProfileRecord | null {
    const cleanUser = username.replace(/^@/, "");
    const row = this.stmtGetProfileByUsername.get(cleanUser) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const recentRows = this.stmtListPostsByOwner.all(cleanUser, 12, 0) as Array<
      Record<string, unknown>
    >;
    const recentPostsPreview = recentRows.map((r) => this.mapPostRow(r));

    return {
      id: String(row.id),
      username: String(row.username),
      fullName: String(row.full_name || ""),
      biography: String(row.biography || ""),
      externalUrl: row.external_url ? String(row.external_url) : undefined,
      profilePicUrl: row.profile_pic_url ? String(row.profile_pic_url) : undefined,
      isVerified: Boolean(row.is_verified),
      isPrivate: Boolean(row.is_private),
      followerCount: Number(row.follower_count || 0),
      followingCount: Number(row.following_count || 0),
      mediaCount: Number(row.media_count || 0),
      recentPostsPreview,
    };
  }

  getProfileById(id: string): InstagramProfileRecord | null {
    const row = this.stmtGetProfileById.get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const cleanUser = String(row.username);
    const recentRows = this.stmtListPostsByOwner.all(cleanUser, 12, 0) as Array<
      Record<string, unknown>
    >;
    const recentPostsPreview = recentRows.map((r) => this.mapPostRow(r));

    return {
      id: String(row.id),
      username: cleanUser,
      fullName: String(row.full_name || ""),
      biography: String(row.biography || ""),
      externalUrl: row.external_url ? String(row.external_url) : undefined,
      profilePicUrl: row.profile_pic_url ? String(row.profile_pic_url) : undefined,
      isVerified: Boolean(row.is_verified),
      isPrivate: Boolean(row.is_private),
      followerCount: Number(row.follower_count || 0),
      followingCount: Number(row.following_count || 0),
      mediaCount: Number(row.media_count || 0),
      recentPostsPreview,
    };
  }

  listHarvestRuns(limit = 20): InstagramHarvestRunRecord[] {
    const rows = this.stmtListHarvestRuns.all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      runId: String(r.run_id),
      targetType: String(r.target_type),
      targetQuery: String(r.target_query),
      engineUsed: String(r.engine_used),
      status: r.status as "success" | "failed",
      itemsHarvested: Number(r.items_harvested || 0),
      commentsHarvested: Number(r.comments_harvested || 0),
      durationMs: Number(r.duration_ms || 0),
      errorMessage: r.error_message ? String(r.error_message) : undefined,
      createdAt: Number(r.created_at || 0),
    }));
  }

  listProfileSnapshots(
    profileId: string,
    limit = 30
  ): Array<{
    followerCount: number;
    followingCount: number;
    mediaCount: number;
    capturedAt: number;
  }> {
    const rows = this.stmtListSnapshotsByProfileId.all(profileId, limit) as Array<{
      follower_count: number;
      following_count: number;
      media_count: number;
      captured_at: number;
    }>;
    return rows.map((r) => ({
      followerCount: r.follower_count,
      followingCount: r.following_count,
      mediaCount: r.media_count,
      capturedAt: r.captured_at,
    }));
  }

  getPost(shortcode: string): InstagramMediaRecord | null {
    const row = this.stmtGetPostByShortcode.get(shortcode) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return this.mapPostRow(row);
  }

  listPosts(options?: {
    ownerUsername?: string;
    limit?: number;
    offset?: number;
  }): InstagramMediaRecord[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let rows: Array<Record<string, unknown>>;
    if (options?.ownerUsername) {
      rows = this.stmtListPostsByOwner.all(
        options.ownerUsername.replace(/^@/, ""),
        limit,
        offset
      ) as Array<Record<string, unknown>>;
    } else {
      rows = this.stmtListAllPosts.all(limit, offset) as Array<Record<string, unknown>>;
    }

    return rows.map((r) => this.mapPostRow(r));
  }

  listComments(postShortcode: string, limit = 50, offset = 0): InstagramCommentRecord[] {
    const rows = this.stmtListCommentsByPostShortcode.all(postShortcode, limit, offset) as Array<
      Record<string, unknown>
    >;

    return rows.map((r) => ({
      id: String(r.id),
      username: String(r.author_username),
      text: String(r.text),
      likeCount: Number(r.like_count || 0),
      createdAtTimestamp: r.created_at ? Number(r.created_at) : undefined,
      authorProfilePicUrl: r.author_profile_pic_url ? String(r.author_profile_pic_url) : undefined,
      authorIsVerified: Boolean(r.author_is_verified),
    }));
  }

  getStats(): InstagramDatabaseStats {
    const profileRow = this.db.prepare("SELECT COUNT(*) AS c FROM instagram_profiles;").get() as {
      c: number;
    };
    const postRow = this.db.prepare("SELECT COUNT(*) AS c FROM instagram_posts;").get() as {
      c: number;
    };
    const slideRow = this.db.prepare("SELECT COUNT(*) AS c FROM instagram_post_slides;").get() as {
      c: number;
    };
    const commentRow = this.db.prepare("SELECT COUNT(*) AS c FROM instagram_comments;").get() as {
      c: number;
    };
    const hashtagRow = this.db.prepare("SELECT COUNT(*) AS c FROM instagram_hashtags;").get() as {
      c: number;
    };
    const snapshotRow = this.db
      .prepare("SELECT COUNT(*) AS c FROM instagram_profile_snapshots;")
      .get() as { c: number };
    const harvestRow = this.db
      .prepare("SELECT COUNT(*) AS c FROM instagram_harvest_runs;")
      .get() as { c: number };

    return {
      profileCount: profileRow?.c || 0,
      postCount: postRow?.c || 0,
      slideCount: slideRow?.c || 0,
      commentCount: commentRow?.c || 0,
      hashtagCount: hashtagRow?.c || 0,
      snapshotCount: snapshotRow?.c || 0,
      harvestRunCount: harvestRow?.c || 0,
    };
  }

  private mapPostRow(row: Record<string, unknown>): InstagramMediaRecord {
    const shortcode = String(row.shortcode);
    const slidesRows = this.stmtListSlidesByPostShortcode.all(shortcode) as Array<
      Record<string, unknown>
    >;
    const children: InstagramMediaChild[] = slidesRows.map((s) => ({
      id: String(s.id),
      mediaType: s.media_type as "image" | "video",
      displayUrl: String(s.display_url),
      videoUrl: s.video_url ? String(s.video_url) : undefined,
      dimensions:
        s.width && s.height ? { width: Number(s.width), height: Number(s.height) } : undefined,
    }));

    const commentRows = this.stmtListCommentsByPostShortcode.all(shortcode, 10, 0) as Array<
      Record<string, unknown>
    >;
    const comments: InstagramCommentRecord[] = commentRows.map((c) => ({
      id: String(c.id),
      username: String(c.author_username),
      text: String(c.text),
      likeCount: Number(c.like_count || 0),
      createdAtTimestamp: c.created_at ? Number(c.created_at) : undefined,
      authorProfilePicUrl: c.author_profile_pic_url ? String(c.author_profile_pic_url) : undefined,
      authorIsVerified: Boolean(c.author_is_verified),
    }));

    const hashtagRows = this.stmtListHashtagsByPostShortcode.all(shortcode) as Array<{
      hashtag: string;
    }>;
    const hashtags = hashtagRows.map((h) => h.hashtag);

    const mentionRows = this.stmtListMentionsByPostShortcode.all(shortcode) as Array<{
      mentioned_username: string;
    }>;
    const mentions = mentionRows.map((m) => m.mentioned_username);

    return {
      id: String(row.id),
      shortcode,
      url: `https://www.instagram.com/p/${shortcode}/`,
      mediaType: row.media_type as InstagramMediaType,
      caption: String(row.caption || ""),
      likeCount: Number(row.like_count || 0),
      commentCount: Number(row.comment_count || 0),
      takenAtTimestamp: Number(row.taken_at || 0),
      displayUrl: String(row.display_url || ""),
      videoUrl: row.video_url ? String(row.video_url) : undefined,
      videoViewCount: row.video_view_count ? Number(row.video_view_count) : undefined,
      hashtags,
      mentions,
      children: children.length > 0 ? children : undefined,
      comments: comments.length > 0 ? comments : undefined,
      location: row.location_name
        ? {
            id: String(row.location_id || ""),
            name: String(row.location_name),
            slug: row.location_slug ? String(row.location_slug) : undefined,
          }
        : undefined,
      owner: {
        id: String(row.owner_id || ""),
        username: String(row.owner_username),
      },
    };
  }

  /**
   * Retrieves set of existing post shortcodes to prevent redundant scraping.
   */
  getExistingShortcodes(ownerUsername?: string): Set<string> {
    const query = ownerUsername
      ? this.db.prepare("SELECT shortcode FROM instagram_posts WHERE owner_username = ?;")
      : this.db.prepare("SELECT shortcode FROM instagram_posts;");
    const rows = (ownerUsername ? query.all(ownerUsername) : query.all()) as Array<{
      shortcode: string;
    }>;
    return new Set(rows.map((r) => r.shortcode));
  }

  /**
   * Updates local disk path for a post.
   */
  updatePostLocalPath(shortcode: string, localPath: string): void {
    this.stmtUpdatePostLocalPath.run({
      $shortcode: shortcode,
      $local_path: localPath,
    });
  }

  /**
   * Updates local disk path for an individual slide.
   */
  updateSlideLocalPath(id: string, localPath: string): void {
    this.stmtUpdateSlideLocalPath.run({
      $id: id,
      $local_path: localPath,
    });
  }

  /**
   * Retrieves pending media items that have not yet been downloaded to disk.
   */
  getPendingMediaDownloads(username?: string): {
    posts: Array<{
      id: string;
      shortcode: string;
      owner_username: string;
      media_type: string;
      display_url: string;
      video_url?: string;
      local_path?: string;
    }>;
    slides: Array<{
      id: string;
      post_shortcode: string;
      slide_order: number;
      media_type: string;
      display_url: string;
      video_url?: string;
      owner_username: string;
      local_path?: string;
    }>;
  } {
    const postQuery = username
      ? `SELECT id, shortcode, owner_username, media_type, display_url, video_url, local_path
         FROM instagram_posts
         WHERE owner_username = ? AND (local_path IS NULL OR local_path = '') AND display_url IS NOT NULL AND display_url != ''`
      : `SELECT id, shortcode, owner_username, media_type, display_url, video_url, local_path
         FROM instagram_posts
         WHERE (local_path IS NULL OR local_path = '') AND display_url IS NOT NULL AND display_url != ''`;

    const slideQuery = username
      ? `SELECT s.id, s.post_shortcode, s.slide_order, s.media_type, s.display_url, s.video_url, s.local_path, p.owner_username
         FROM instagram_post_slides s
         JOIN instagram_posts p ON s.post_shortcode = p.shortcode
         WHERE p.owner_username = ? AND (s.local_path IS NULL OR s.local_path = '') AND s.display_url IS NOT NULL AND s.display_url != ''
         ORDER BY s.post_shortcode, s.slide_order ASC`
      : `SELECT s.id, s.post_shortcode, s.slide_order, s.media_type, s.display_url, s.video_url, s.local_path, p.owner_username
         FROM instagram_post_slides s
         JOIN instagram_posts p ON s.post_shortcode = p.shortcode
         WHERE (s.local_path IS NULL OR s.local_path = '') AND s.display_url IS NOT NULL AND s.display_url != ''
         ORDER BY s.post_shortcode, s.slide_order ASC`;

    type PendingPostRow = {
      id: string;
      shortcode: string;
      owner_username: string;
      media_type: string;
      display_url: string;
      video_url?: string;
      local_path?: string;
    };
    type PendingSlideRow = {
      id: string;
      post_shortcode: string;
      slide_order: number;
      media_type: string;
      display_url: string;
      video_url?: string;
      owner_username: string;
      local_path?: string;
    };

    const posts = (username
      ? this.db.prepare(postQuery).all(username)
      : this.db.prepare(postQuery).all()) as unknown as PendingPostRow[];
    const slides = (username
      ? this.db.prepare(slideQuery).all(username)
      : this.db.prepare(slideQuery).all()) as unknown as PendingSlideRow[];

    return { posts, slides };
  }

  close(): void {
    this.db.close();
  }
}
