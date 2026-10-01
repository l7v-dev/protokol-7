/**
 * InstagramActor Unit & Integration Tests — protokol-7
 *
 * Validates parameter resolution, domain normalization, SSRF defenses,
 * GFM Markdown synthesis, and end-to-end REST router dispatch.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { ACTOR_MANIFESTS } from "../src/actors/actor-manifests";
import { createDefaultActorRegistry } from "../src/actors/actor-registry";
import { InstagramActor } from "../src/actors/corpus/instagram-actor";
import { createServer } from "../src/api/server";
import type { ActorTask } from "../src/api/types";

describe("InstagramActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;
      const search = parsedUrl.search;

      // Verify required web client headers
      assert.strictEqual(
        req.headers["x-ig-app-id"],
        "936619743392459",
        "Header X-IG-App-ID must be present"
      );

      // 1. Profile endpoint mock
      if (path.includes("/api/v1/users/web_profile_info")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            data: {
              user: {
                id: "12345678",
                username: "natgeo",
                full_name: "National Geographic",
                biography: "Experience the world through the eyes of National Geographic.",
                external_url: "https://www.nationalgeographic.com",
                profile_pic_url: "https://cdn.example.com/natgeo_pic.jpg",
                is_verified: true,
                is_private: false,
                edge_followed_by: { count: 280000000 },
                edge_follow: { count: 145 },
                edge_owner_to_timeline_media: {
                  count: 29500,
                  edges: [
                    {
                      node: {
                        id: "3000000001",
                        shortcode: "C_post1",
                        __typename: "GraphImage",
                        is_video: false,
                        display_url: "https://cdn.example.com/post1.jpg",
                        edge_media_to_caption: {
                          edges: [
                            {
                              node: {
                                text: "A breathtaking view of the savannah with @wildlife #nature #africa",
                              },
                            },
                          ],
                        },
                        edge_liked_by: { count: 154000 },
                        edge_media_to_comment: { count: 820 },
                        taken_at_timestamp: 1710000000,
                      },
                    },
                    {
                      node: {
                        id: "3000000002",
                        shortcode: "C_reel1",
                        __typename: "GraphVideo",
                        is_video: true,
                        display_url: "https://cdn.example.com/reel1_thumb.jpg",
                        video_url: "https://cdn.example.com/reel1_video.mp4",
                        video_view_count: 520000,
                        edge_media_to_caption: {
                          edges: [
                            {
                              node: {
                                text: "Dolphins jumping at sunset #ocean #wildlife",
                              },
                            },
                          ],
                        },
                        edge_liked_by: { count: 98000 },
                        edge_media_to_comment: { count: 430 },
                        taken_at_timestamp: 1710100000,
                      },
                    },
                  ],
                },
              },
            },
          })
        );
        return;
      }

      // 2. Post detail endpoint mock
      if (path.includes("/p/C_post1") && search.includes("__a=1")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            items: [
              {
                id: "3000000001",
                code: "C_post1",
                media_type: 1,
                caption: {
                  text: "A breathtaking view of the savannah with @wildlife #nature #africa",
                },
                like_count: 154000,
                comment_count: 820,
                taken_at: 1710000000,
                image_versions2: {
                  candidates: [{ url: "https://cdn.example.com/post1_hd.jpg" }],
                },
                location: {
                  id: "999",
                  name: "Serengeti National Park",
                },
                owner: {
                  id: "12345678",
                  username: "natgeo",
                  full_name: "National Geographic",
                  is_verified: true,
                },
              },
            ],
          })
        );
        return;
      }

      // 3. Hashtag endpoint mock
      if (path.includes("/api/v1/tags/web_info")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            data: {
              hashtag: {
                name: "nature",
                media_count: 125000000,
                edge_hashtag_to_top_posts: {
                  edges: [
                    {
                      node: {
                        id: "5000000001",
                        shortcode: "C_top1",
                        __typename: "GraphImage",
                        display_url: "https://cdn.example.com/top1.jpg",
                        edge_media_to_caption: {
                          edges: [{ node: { text: "Peak of Mount Everest #nature #mountains" } }],
                        },
                        edge_liked_by: { count: 450000 },
                        edge_media_to_comment: { count: 3200 },
                        taken_at_timestamp: 1710200000,
                      },
                    },
                  ],
                },
                edge_hashtag_to_media: {
                  count: 125000000,
                  edges: [],
                },
              },
            },
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (typeof addr === "object" && addr !== null) {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it("resolves targets correctly from URLs, usernames, shortcodes, and hashtags", () => {
    const actor = new InstagramActor();

    // From username option
    const r1 = actor.resolveTarget(undefined, { username: "natgeo" });
    assert.strictEqual(r1?.action, "profile");
    assert.strictEqual(r1?.username, "natgeo");

    // From username option with @ prefix
    const r2 = actor.resolveTarget(undefined, { username: "@natgeo" });
    assert.strictEqual(r2?.username, "natgeo");

    // From post URL
    const r3 = actor.resolveTarget("https://www.instagram.com/p/C_abc123/");
    assert.strictEqual(r3?.action, "post");
    assert.strictEqual(r3?.shortcode, "C_abc123");

    // From reel URL
    const r4 = actor.resolveTarget("https://www.instagram.com/reel/C_reel999/?igsh=123");
    assert.strictEqual(r4?.action, "post");
    assert.strictEqual(r4?.shortcode, "C_reel999");

    // From hashtag URL
    const r5 = actor.resolveTarget("https://www.instagram.com/explore/tags/wildlife/");
    assert.strictEqual(r5?.action, "hashtag");
    assert.strictEqual(r5?.hashtag, "wildlife");

    // From hashtag string
    const r6 = actor.resolveTarget(undefined, { hashtag: "#nature" });
    assert.strictEqual(r6?.action, "hashtag");
    assert.strictEqual(r6?.hashtag, "nature");
  });

  it("normalizes user profile payload accurately", () => {
    const actor = new InstagramActor();
    const rawUser = {
      id: "987654",
      username: "space_explorer",
      full_name: "Space Explorer",
      biography: "Astronomy enthusiast #cosmos",
      is_verified: true,
      is_private: false,
      edge_followed_by: { count: 50000 },
      edge_follow: { count: 120 },
      edge_owner_to_timeline_media: {
        count: 15,
        edges: [
          {
            node: {
              id: "101",
              shortcode: "C_mars",
              display_url: "https://example.com/mars.jpg",
              edge_media_to_caption: {
                edges: [{ node: { text: "Mars rover updates #mars @nasa" } }],
              },
              edge_liked_by: { count: 1200 },
              edge_media_to_comment: { count: 45 },
            },
          },
        ],
      },
    };

    const profile = actor.normalizeProfile(rawUser);
    assert.strictEqual(profile.username, "space_explorer");
    assert.strictEqual(profile.fullName, "Space Explorer");
    assert.strictEqual(profile.followerCount, 50000);
    assert.strictEqual(profile.followingCount, 120);
    assert.strictEqual(profile.mediaCount, 15);
    assert.strictEqual(profile.isVerified, true);
    assert.strictEqual(profile.recentPostsPreview?.length, 1);
    assert.strictEqual(profile.recentPostsPreview?.[0].shortcode, "C_mars");
    assert.deepStrictEqual(profile.recentPostsPreview?.[0].hashtags, ["mars"]);
    assert.deepStrictEqual(profile.recentPostsPreview?.[0].mentions, ["nasa"]);
  });

  it("normalizes media post payloads with image, video, and carousel", () => {
    const actor = new InstagramActor();

    // Carousel post
    const rawCarousel = {
      id: "201",
      shortcode: "C_carousel",
      __typename: "GraphSidecar",
      display_url: "https://example.com/cover.jpg",
      edge_media_to_caption: {
        edges: [{ node: { text: "Swipe to see more! #slideshow #photography" } }],
      },
      edge_liked_by: { count: 2500 },
      edge_media_to_comment: { count: 30 },
      edge_sidecar_to_children: {
        edges: [
          {
            node: {
              id: "201-1",
              is_video: false,
              display_url: "https://example.com/slide1.jpg",
            },
          },
          {
            node: {
              id: "201-2",
              is_video: true,
              display_url: "https://example.com/slide2_thumb.jpg",
              video_url: "https://example.com/slide2.mp4",
            },
          },
        ],
      },
    };

    const media = actor.normalizeMedia(rawCarousel);
    assert.strictEqual(media.mediaType, "carousel");
    assert.strictEqual(media.children?.length, 2);
    assert.strictEqual(media.children?.[0].mediaType, "image");
    assert.strictEqual(media.children?.[1].mediaType, "video");
    assert.strictEqual(media.children?.[1].videoUrl, "https://example.com/slide2.mp4");
    assert.deepStrictEqual(media.hashtags, ["slideshow", "photography"]);
  });

  it("synthesizes clean GFM markdown for profiles and posts", () => {
    const actor = new InstagramActor();
    const markdown = actor.synthesizeMarkdown({
      action: "profile",
      query: "natgeo",
      engineUsed: "http",
      markdown: "",
      profile: {
        id: "123",
        username: "natgeo",
        fullName: "National Geographic",
        biography: "Inspiring people to care about the planet.",
        isVerified: true,
        isPrivate: false,
        followerCount: 280000000,
        followingCount: 145,
        mediaCount: 29500,
        recentPostsPreview: [
          {
            id: "1",
            shortcode: "C_lion",
            url: "https://www.instagram.com/p/C_lion/",
            mediaType: "image",
            caption: "Lions resting under an acacia tree #wildlife",
            likeCount: 50000,
            commentCount: 200,
            takenAtTimestamp: 1710000000,
            displayUrl: "https://example.com/lion.jpg",
            hashtags: ["wildlife"],
            mentions: [],
          },
        ],
      },
    });

    assert.ok(markdown.includes("# Instagram Profile: @natgeo"));
    assert.ok(markdown.includes("National Geographic"));
    assert.ok(markdown.includes("280,000,000"));
    assert.ok(markdown.includes("Recent Media Timeline"));
    assert.ok(markdown.includes("[C_lion]"));
  });

  it("executes HTTP profile extraction successfully against mock server", async () => {
    const actor = new InstagramActor();
    const task: ActorTask = {
      taskId: "test-profile-1",
      actorType: "instagram",
      targetUrl: `${mockServerUrl}/api/v1/users/web_profile_info?username=natgeo`,
      options: {
        instagramOptions: {
          action: "profile",
          username: "natgeo",
          extractMarkdown: true,
          allowLocalNetwork: true,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.data?.profile?.username, "natgeo");
    assert.strictEqual(result.data?.profile?.followerCount, 280000000);
    assert.strictEqual(result.data?.profile?.isVerified, true);
    assert.strictEqual(result.data?.profile?.recentPostsPreview?.length, 2);
    assert.ok(result.data?.markdown.includes("# Instagram Profile: @natgeo"));
  });

  it("executes HTTP post extraction successfully against mock server", async () => {
    const actor = new InstagramActor();
    const task: ActorTask = {
      taskId: "test-post-1",
      actorType: "instagram",
      targetUrl: `${mockServerUrl}/p/C_post1/?__a=1&__d=dis`,
      options: {
        instagramOptions: {
          action: "post",
          shortcode: "C_post1",
          extractMarkdown: true,
          allowLocalNetwork: true,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.data?.posts?.length, 1);
    assert.strictEqual(result.data?.posts?.[0].shortcode, "C_post1");
    assert.strictEqual(result.data?.posts?.[0].likeCount, 154000);
    assert.strictEqual(result.data?.posts?.[0].location?.name, "Serengeti National Park");
    assert.deepStrictEqual(result.data?.posts?.[0].hashtags, ["nature", "africa"]);
  });

  it("executes HTTP hashtag extraction successfully against mock server", async () => {
    const actor = new InstagramActor();
    const task: ActorTask = {
      taskId: "test-tag-1",
      actorType: "instagram",
      targetUrl: `${mockServerUrl}/api/v1/tags/web_info?tag_name=nature`,
      options: {
        instagramOptions: {
          action: "hashtag",
          hashtag: "nature",
          extractMarkdown: true,
          allowLocalNetwork: true,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.data?.hashtag?.name, "nature");
    assert.strictEqual(result.data?.hashtag?.topPosts.length, 1);
    assert.strictEqual(result.data?.hashtag?.topPosts[0].shortcode, "C_top1");
  });

  it("rejects malicious or private IP target URLs when local network is disallowed", async () => {
    const actor = new InstagramActor();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "instagram",
        targetUrl: "http://127.0.0.1:8080/evil",
        options: {
          instagramOptions: {
            username: "evil",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("is registered in ActorRegistry and discoverable by ActorType", () => {
    const registry = createDefaultActorRegistry();
    assert.ok(registry.has("instagram"), "Instagram actor must be registered in ActorRegistry");
    const actor = registry.get("instagram");
    assert.ok(actor instanceof InstagramActor);
    assert.strictEqual(actor?.actorType, "instagram");
  });

  it("has complete metadata and query_instagram tool in ACTOR_MANIFESTS", () => {
    const manifest = ACTOR_MANIFESTS.instagram;
    assert.ok(manifest, "Manifest for instagram must exist");
    assert.strictEqual(manifest.name, "instagram");
    assert.strictEqual(manifest.category, "GENERAL");
    assert.strictEqual(manifest.mcpTool.name, "query_instagram");
    assert.ok(manifest.inputSchema.properties.username);
    assert.ok(manifest.inputSchema.properties.shortcode);
    assert.ok(manifest.inputSchema.properties.hashtag);
    assert.ok(manifest.inputSchema.properties.action);
  });

  it("routes POST /api/v1/instagram through the HTTP server router", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "profile",
          username: "natgeo",
          targetUrl: `${mockServerUrl}/api/v1/users/web_profile_info?username=natgeo`,
          options: {
            instagramOptions: {
              allowLocalNetwork: true,
            },
          },
        }),
      });

      assert.strictEqual(response.status, 200);
      const json = (await response.json()) as {
        success: boolean;
        data: { profile: { username: string } };
      };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.profile.username, "natgeo");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
