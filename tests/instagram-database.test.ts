import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  InstagramActorResult,
  InstagramMediaRecord,
  InstagramProfileRecord,
} from "../src/api/types";
import { InstagramDatabase } from "../src/storage/instagram-database";

describe("InstagramDatabase - Relational SQLite Persistence Engine", () => {
  it("initializes SQLite schema cleanly in memory", () => {
    const db = new InstagramDatabase({ inMemory: true });
    const stats = db.getStats();
    assert.strictEqual(stats.profileCount, 0);
    assert.strictEqual(stats.postCount, 0);
    assert.strictEqual(stats.commentCount, 0);
    assert.strictEqual(stats.slideCount, 0);
    assert.strictEqual(stats.snapshotCount, 0);
    db.close();
  });

  it("persists and updates Instagram profiles with growth snapshots", () => {
    const db = new InstagramDatabase({ inMemory: true });

    const profile1: InstagramProfileRecord = {
      id: "user-101",
      username: "tech_insider",
      fullName: "Tech Insider",
      biography: "Latest innovations and engineering insights.",
      externalUrl: "https://techinsider.io",
      profilePicUrl: "https://cdn.example.com/pic1.jpg",
      isVerified: true,
      isPrivate: false,
      followerCount: 150000,
      followingCount: 320,
      mediaCount: 1200,
    };

    db.upsertProfile(profile1);

    const fetched = db.getProfile("tech_insider");
    assert.ok(fetched);
    assert.strictEqual(fetched.id, "user-101");
    assert.strictEqual(fetched.username, "tech_insider");
    assert.strictEqual(fetched.fullName, "Tech Insider");
    assert.strictEqual(fetched.followerCount, 150000);
    assert.strictEqual(fetched.isVerified, true);

    // Verify snapshot captured
    const snapshots1 = db.listProfileSnapshots("user-101");
    assert.strictEqual(snapshots1.length, 1);
    assert.strictEqual(snapshots1[0].followerCount, 150000);

    // Update profile with growth
    const profile2: InstagramProfileRecord = {
      ...profile1,
      followerCount: 155000,
      followingCount: 325,
      mediaCount: 1210,
    };
    db.upsertProfile(profile2);

    const fetchedUpdated = db.getProfile("tech_insider");
    assert.strictEqual(fetchedUpdated?.followerCount, 155000);

    // Second snapshot must be recorded
    const snapshots2 = db.listProfileSnapshots("user-101");
    assert.strictEqual(snapshots2.length, 2);

    db.close();
  });

  it("persists post with carousel slides, hashtags, and mentions", () => {
    const db = new InstagramDatabase({ inMemory: true });

    const post: InstagramMediaRecord = {
      id: "media-999",
      shortcode: "C_carousel_tech",
      url: "https://www.instagram.com/p/C_carousel_tech/",
      mediaType: "carousel",
      caption: "Our top hardware picks of the year #tech #gadgets with @alice and @bob",
      likeCount: 4500,
      commentCount: 2,
      takenAtTimestamp: 1710000000,
      displayUrl: "https://cdn.example.com/cover.jpg",
      hashtags: ["tech", "gadgets"],
      mentions: ["alice", "bob"],
      children: [
        {
          id: "slide-1",
          mediaType: "image",
          displayUrl: "https://cdn.example.com/slide1.jpg",
          dimensions: { width: 1080, height: 1080 },
        },
        {
          id: "slide-2",
          mediaType: "video",
          displayUrl: "https://cdn.example.com/slide2_thumb.jpg",
          videoUrl: "https://cdn.example.com/slide2.mp4",
          dimensions: { width: 1080, height: 1350 },
        },
      ],
      comments: [
        {
          id: "c-100",
          username: "alice",
          text: "Love this list!",
          likeCount: 15,
          createdAtTimestamp: 1710000500,
          authorIsVerified: true,
        },
        {
          id: "c-101",
          username: "gadget_fan",
          text: "Slide 2 is incredible.",
          likeCount: 3,
          createdAtTimestamp: 1710001000,
        },
      ],
      owner: {
        id: "user-101",
        username: "tech_insider",
      },
    };

    db.upsertPost(post, "tech_insider");

    const fetched = db.getPost("C_carousel_tech");
    assert.ok(fetched);
    assert.strictEqual(fetched.shortcode, "C_carousel_tech");
    assert.strictEqual(fetched.mediaType, "carousel");
    assert.strictEqual(fetched.likeCount, 4500);
    assert.strictEqual(fetched.children?.length, 2);
    assert.strictEqual(fetched.children?.[0].mediaType, "image");
    assert.strictEqual(fetched.children?.[1].videoUrl, "https://cdn.example.com/slide2.mp4");
    assert.strictEqual(fetched.comments?.length, 2);
    assert.strictEqual(fetched.comments?.[0].username, "gadget_fan");
    assert.strictEqual(fetched.comments?.[1].username, "alice");
    assert.strictEqual(fetched.comments?.[1].authorIsVerified, true);
    assert.deepStrictEqual(fetched.hashtags.sort(), ["gadgets", "tech"]);
    assert.deepStrictEqual(fetched.mentions.sort(), ["alice", "bob"]);

    const stats = db.getStats();
    assert.strictEqual(stats.postCount, 1);
    assert.strictEqual(stats.slideCount, 2);
    assert.strictEqual(stats.commentCount, 2);
    assert.strictEqual(stats.hashtagCount, 2);

    db.close();
  });

  it("executes atomic transaction when saving full InstagramActorResult", () => {
    const db = new InstagramDatabase({ inMemory: true });

    const actorResult: InstagramActorResult = {
      action: "profile",
      query: "art_gallery",
      engineUsed: "http",
      markdown: "",
      profile: {
        id: "art-1",
        username: "art_gallery",
        fullName: "Modern Art Gallery",
        biography: "Curated modern art exhibitions.",
        isVerified: false,
        isPrivate: false,
        followerCount: 50000,
        followingCount: 150,
        mediaCount: 300,
        recentPostsPreview: [
          {
            id: "post-art-1",
            shortcode: "C_sculpture",
            url: "https://www.instagram.com/p/C_sculpture/",
            mediaType: "image",
            caption: "New bronze sculpture on display #art #museum",
            likeCount: 1200,
            commentCount: 1,
            takenAtTimestamp: 1715000000,
            displayUrl: "https://cdn.example.com/sculpture.jpg",
            hashtags: ["art", "museum"],
            mentions: [],
            comments: [
              {
                id: "c-art-1",
                username: "art_lover",
                text: "Stunning craftsmanship!",
                likeCount: 8,
              },
            ],
          },
        ],
      },
    };

    const saved = db.saveActorResult(actorResult);
    assert.strictEqual(saved.profilesSaved, 1);
    assert.strictEqual(saved.postsSaved, 1);
    assert.strictEqual(saved.commentsSaved, 1);

    const stats = db.getStats();
    assert.strictEqual(stats.profileCount, 1);
    assert.strictEqual(stats.postCount, 1);
    assert.strictEqual(stats.commentCount, 1);

    // Verify profile lookup
    const profile = db.getProfile("art_gallery");
    assert.strictEqual(profile?.username, "art_gallery");
    assert.strictEqual(profile?.recentPostsPreview?.length, 1);
    assert.strictEqual(profile?.recentPostsPreview?.[0].shortcode, "C_sculpture");

    db.close();
  });

  it("records harvest audit logs and tracks execution runs", () => {
    const db = new InstagramDatabase({ inMemory: true });

    db.recordHarvestRun({
      runId: "run-001",
      targetType: "profile",
      targetQuery: "natgeo",
      engineUsed: "browser",
      status: "success",
      itemsHarvested: 13,
      commentsHarvested: 5,
      durationMs: 4200,
      createdAt: Math.floor(Date.now() / 1000),
    });

    const stats = db.getStats();
    assert.strictEqual(stats.harvestRunCount, 1);

    db.close();
  });
});
