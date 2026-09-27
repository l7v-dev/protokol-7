import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { MitOcwActor } from "../src/actors/mit-ocw-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_MIT_SEARCH_RESPONSE = {
  hits: {
    total: {
      value: 1,
    },
    hits: [
      {
        _id: "ocw-1806",
        _source: {
          id: 13522,
          course_id: "18-06-linear-algebra-spring-2010",
          coursenum: "18.06",
          title: "Linear Algebra",
          department_name: "Mathematics",
          topics: ["Mathematics", "Linear Algebra"],
          platform: "ocw",
          runs: [
            {
              id: 101,
              slug: "courses/18-06-linear-algebra-spring-2010",
              semester: "Spring",
              year: 2010,
              level: ["Undergraduate"],
              instructors: ["Prof. Gilbert Strang"],
              short_description: "Basic subject on matrix theory and linear algebra.",
            },
          ],
        },
      },
    ],
  },
};

const MOCK_COURSE_DATA_JSON = {
  course_title: "Linear Algebra",
  primary_course_number: "18.06",
  course_description: "<p>Matrix theory, systems of equations, vector spaces, and eigenvalues.</p>",
  level: ["Undergraduate"],
  term: "Spring",
  year: 2010,
  department: "Mathematics",
  topics: [["Mathematics", "Linear Algebra"]],
  instructors: [
    {
      title: "Prof. Gilbert Strang",
      first_name: "Gilbert",
      last_name: "Strang",
    },
  ],
  learning_resource_types: ["Lecture Videos", "Exams", "Assignments"],
  site_url_path: "/courses/18-06-linear-algebra-spring-2010/",
};

test("MitOcwActor searches courses and extracts structured metadata", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(MOCK_MIT_SEARCH_RESPONSE));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new MitOcwActor();
    const task = {
      taskId: "test-mit-1",
      actorType: "mit-ocw" as const,
      targetUrl: `http://127.0.0.1:${port}/open.mit.edu/api/v0/search/`,
      options: {
        mitOcwOptions: {
          query: "linear algebra",
          limit: 5,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    assert.equal(result.data.courses.length, 1);
    assert.equal(result.data.courses[0].title, "Linear Algebra");
    assert.equal(result.data.courses[0].courseNumber, "18.06");
    assert.equal(result.data.courses[0].instructors?.[0], "Prof. Gilbert Strang");
    assert.ok(result.data.markdown.includes("MIT OpenCourseWare Search"));
    assert.ok(result.data.markdown.includes("Gilbert Strang"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MitOcwActor retrieves course syllabus detail by courseSlug", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_COURSE_DATA_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new MitOcwActor();
    const task = {
      taskId: "test-mit-2",
      actorType: "mit-ocw" as const,
      targetUrl: `http://127.0.0.1:${port}/ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/data.json`,
      options: {
        mitOcwOptions: {
          courseSlug: "18-06-linear-algebra-spring-2010",
          action: "course" as const,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.courseSlug, "18-06-linear-algebra-spring-2010");
    assert.equal(result.data.courses[0].title, "Linear Algebra");
    assert.equal(result.data.courses[0].courseNumber, "18.06");
    assert.ok(result.data.markdown.includes("Lecture Videos"));
    assert.ok(result.data.markdown.includes("Course Description & Syllabus"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MitOcwActor blocks SSRF attempt in production environment", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  try {
    const actor = new MitOcwActor();
    const task = {
      taskId: "test-ssrf-mit",
      actorType: "mit-ocw" as const,
      targetUrl: "http://127.0.0.1:8080/internal",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "failed");
    assert.ok(result.errorMessage?.includes("SSRF validation"));
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  }
});
