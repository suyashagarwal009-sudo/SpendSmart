'use strict';

/**
 * Insights controller (Phase 7).
 *
 * POST /api/insights — computes verified spending statistics for a
 * month from the data store, then adds a narrative (AI-generated when
 * the Anthropic key is configured, deterministic fallback otherwise).
 * Calculations and narrative are kept as separate response fields so
 * the client can always label which numbers are verified and which
 * text is generated.
 */

const { HttpError } = require('../utils/errors');
const { computeInsights, isValidMonthKey } = require('../services/insightsService');
const { buildFallbackNarrative } = require('../services/aiNarrative');
const { currentMonthKey } = require('../utils/month');

const AI_STATUS_MESSAGES = {
  'not-configured': 'AI service is not configured; showing an offline summary.',
  'rate-limited': 'AI service is rate-limited right now; showing an offline summary.',
  timeout: 'AI service timed out; showing an offline summary.',
  'invalid-response': 'AI gave an unusable reply; showing an offline summary.',
  unavailable: 'AI service is unavailable; showing an offline summary.',
};

function createInsightsController(store, narrator) {
  return {
    /** POST /api/insights */
    async createInsights(req, res) {
      const body = req.body || {};
      if (body.month !== undefined && !isValidMonthKey(body.month)) {
        throw HttpError.badRequest('Invalid month', {
          month: 'Month must be in YYYY-MM format, e.g. 2026-11',
        });
      }

      const month = body.month || currentMonthKey();
      const calculations = await computeInsights(store, month);

      // Nothing recorded: a friendly deterministic message, no AI call.
      if (calculations.insufficientData) {
        return res.status(200).json({
          success: true,
          data: {
            month,
            calculations,
            narrative: buildFallbackNarrative(calculations),
            narrativeSource: 'fallback',
            aiStatus: 'skipped',
          },
        });
      }

      const result = await narrator.generateNarrative(calculations);
      if (result.ok) {
        return res.status(200).json({
          success: true,
          data: {
            month,
            calculations,
            narrative: result.narrative,
            narrativeSource: 'ai',
            aiStatus: 'ok',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          month,
          calculations,
          narrative: buildFallbackNarrative(calculations),
          narrativeSource: 'fallback',
          aiStatus: result.reason,
          aiMessage: AI_STATUS_MESSAGES[result.reason] || AI_STATUS_MESSAGES.unavailable,
        },
      });
    },
  };
}

module.exports = { createInsightsController };
