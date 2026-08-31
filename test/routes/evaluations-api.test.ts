import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('evaluations API endpoints', () => {
  it('manages evaluation config, submits feedback and aggregates model leaderboard', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Get evaluation config
    const configRes = await app.inject({
      method: 'GET',
      url: '/api/v1/evaluations/config'
    });
    expect(configRes.statusCode).toBe(200);
    expect(configRes.json().enable_evaluations).toBe(true);

    // 2. Submit evaluation feedback
    const feedbackRes = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluations/feedback',
      payload: {
        model_id: 'director-autonomous-v1',
        rating: 5,
        feedback: 'Kazıma kurallarını ve bot korumasını kusursuz aştı.'
      }
    });
    expect(feedbackRes.statusCode).toBe(200);
    const feedback = feedbackRes.json();
    expect(feedback.id).toBeDefined();
    expect(feedback.rating).toBe(5);

    // 3. Get leaderboard
    const leaderboardRes = await app.inject({
      method: 'GET',
      url: '/api/v1/evaluations/leaderboard'
    });
    expect(leaderboardRes.statusCode).toBe(200);
    const leaderboard = leaderboardRes.json();
    expect(leaderboard.length).toBeGreaterThanOrEqual(1);
    expect(leaderboard[0].model_id).toBe('director-autonomous-v1');
    expect(leaderboard[0].score).toBe(5);

    await app.close();
  });
});
