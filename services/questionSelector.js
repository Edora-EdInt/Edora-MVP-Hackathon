/**
 * QuestionSelector — Data-source agnostic selection engine.
 *
 * Given an ExamBlueprint and a QuestionBank, selects questions that best
 * match the blueprint's constraints (board, class, subject, chapters,
 * difficulty distribution, question type distribution, total marks).
 *
 * Supports multi-variant generation with diversity-aware selection,
 * slot diagnostics, and similarity analysis.
 *
 * @class QuestionSelector
 */
class QuestionSelector {
  constructor(questionBank) {
    this.bank = questionBank;
  }

  /**
   * Single-paper selection.
   */
  select(blueprint) {
    const pool = this._filterPool(blueprint);
    return this._selectFromPool(blueprint, pool, new Set());
  }

  /**
   * Generate N variant papers. Each variant prefers questions not used
   * by earlier variants. Falls back to reuse only when insufficient
   * unique questions exist for a slot.
   *
   * @param {Object} blueprint
   * @param {number} count
   * @returns {Array<{label, questions, sections, compliance, totalMarksSelected, totalQuestionsSelected, warnings, slotSelection}>}
   */
  selectVariants(blueprint, count) {
    const pool = this._filterPool(blueprint);
    const globallyUsedIds = new Set();
    const allLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const papers = [];
    const slotMaps = [];

    for (let i = 0; i < count; i++) {
      const label = allLabels[i] || String(i + 1);

      // Build slot map before selection for diagnostics
      const slotMap = this._buildSlotMap(blueprint, pool);
      slotMaps.push(slotMap);

      const result = this._selectFromPool(blueprint, pool, globallyUsedIds);
      const hadShortfall = result.totalMarksSelected < (blueprint.config.totalMarks || 0);

      // Track slot consumption for diagnostics
      this._populateSlotSelection(slotMap, result.label || label, result.questions);

      result.label = label;

      // Add to global exclusion for next variant
      for (const q of result.questions) {
        globallyUsedIds.add(q.id);
      }

      papers.push(result);
    }

    // Merge slot diagnostics into each paper
    const merged = this._mergeSlotMaps(slotMaps);
    for (const p of papers) {
      p.slotSelection = merged;
    }

    // Similarity analysis
    papers.similarity = this._calculateSimilarity(papers);

    // Determine if diversity warning is needed
    const hasLowDiversity = papers.similarity.some(function(s) { return s.overlap > 30; });
    if (hasLowDiversity && papers.length > 1) {
      var diversityWarn = 'The question bank does not contain enough alternative questions to generate fully distinct variants.\n\n'
        + 'Additional questions are required for better variant diversity.\n\n'
        + 'Variants have been generated using the closest possible alternatives.';
      for (var w = 0; w < papers.length; w++) {
        if (!papers[w].warnings) papers[w].warnings = [];
        papers[w].warnings.push(diversityWarn);
      }
    }

    // Marks shortfall on fallback → still show variant-level warning
    for (var pIdx = 0; pIdx < papers.length; pIdx++) {
      var p = papers[pIdx];
      if (p.totalMarksSelected < (blueprint.config.totalMarks || 0)) {
        if (!p.warnings) p.warnings = [];
        p.warnings.push('This variant could not fully satisfy the blueprint due to insufficient eligible questions.');
      }
    }

    return papers;
  }

  /**
   * Core selection. excludeIds are questions used by prior variants.
   * First pass: only consider questions NOT in excludeIds.
   * Fallback pass: allow questions from excludeIds but NOT this variant's own.
   * @private
   */
  _selectFromPool(blueprint, pool, excludeIds) {
    if (pool.length === 0) {
      return this._emptyResult('No questions found matching the selected criteria.');
    }

    const totalMarks = blueprint.config.totalMarks || 0;
    const diffDist = blueprint.difficulty || { easy: 30, medium: 50, hard: 20 };
    const qtDist = blueprint.questionTypes || { mcq: 30, short: 25, long: 20, caseStudy: 10, numerical: 15 };

    const typeMap = this._buildTypeMap(qtDist, totalMarks);
    const selected = [];
    const ownUsed = new Set();
    const usedIds = new Set(excludeIds);

    for (const { typeName, marksNeeded } of Object.values(typeMap)) {
      if (marksNeeded <= 0) continue;

      const typeQuestions = pool.filter(q => q.questionType === typeName);
      const diffBuckets = this._buildDifficultyBuckets(diffDist, marksNeeded);

      for (const { diffName, diffMarks } of diffBuckets) {
        if (diffMarks <= 0) continue;

        // First pass: only questions not used by other variants and not used by us
        let candidates = typeQuestions
          .filter(q => q.difficulty === diffName && !usedIds.has(q.id))
          .sort((a, b) => b.marks - a.marks);

        let remaining = diffMarks;
        let selectedFromBucket = [];

        for (const q of candidates) {
          if (q.marks <= remaining) {
            selectedFromBucket.push(q);
            ownUsed.add(q.id);
            usedIds.add(q.id);
            remaining -= q.marks;
          }
        }

        // Fallback: allow questions from other variants (blocked set)
        // but NOT our own already-selected questions
        if (remaining > 0) {
          const reusePool = typeQuestions
            .filter(q => q.difficulty === diffName && !ownUsed.has(q.id))
            .sort((a, b) => b.marks - a.marks);

          for (const q of reusePool) {
            if (q.marks <= remaining) {
              selectedFromBucket.push(q);
              ownUsed.add(q.id);
              usedIds.add(q.id);
              remaining -= q.marks;
            }
          }
        }

        // Handle remaining < smallest selected question
        if (remaining > 0 && selectedFromBucket.length > 0) {
          const last = selectedFromBucket[selectedFromBucket.length - 1];
          if (remaining < last.marks) {
            remaining += last.marks;
            ownUsed.delete(last.id);
            usedIds.delete(last.id);
            selectedFromBucket.pop();

            const smaller = typeQuestions
              .filter(q => q.difficulty === diffName && !ownUsed.has(q.id) && q.marks <= remaining)
              .sort((a, b) => b.marks - a.marks);

            if (smaller.length > 0) {
              selectedFromBucket.push(smaller[0]);
              ownUsed.add(smaller[0].id);
              usedIds.add(smaller[0].id);
            }
          }
        }

        selected.push(...selectedFromBucket);
      }
    }

    const ordered = this._sortByType(selected);
    const sections = this._organizeByType(ordered);
    const totalMarksSelected = ordered.reduce((s, q) => s + q.marks, 0);
    const compliance = this._calculateCompliance(ordered, blueprint, pool);
    const reasons = this._analyzeFailures(compliance, blueprint, pool, ordered);
    compliance.reasons = reasons;

    return {
      questions: ordered,
      sections: sections,
      compliance: compliance,
      totalMarksSelected: totalMarksSelected,
      totalQuestionsSelected: ordered.length,
      errors: [],
      warnings: [],
    };
  }

  // ── Slot Diagnostics ──

  /**
   * Build a slot map: key = typeName_diffName, value = { eligible, byVariant }.
   */
  _buildSlotMap(blueprint, pool) {
    const totalMarks = blueprint.config.totalMarks || 0;
    const diffDist = blueprint.difficulty || {};
    const qtDist = blueprint.questionTypes || {};
    const typeMap = this._buildTypeMap(qtDist, totalMarks);
    const slotMap = {};

    for (const { typeName, marksNeeded } of Object.values(typeMap)) {
      if (marksNeeded <= 0) continue;
      const typeQuestions = pool.filter(q => q.questionType === typeName);
      const diffBuckets = this._buildDifficultyBuckets(diffDist, marksNeeded);

      for (const { diffName, diffMarks } of diffBuckets) {
        if (diffMarks <= 0) continue;
        const eligible = typeQuestions.filter(q => q.difficulty === diffName);
        const key = typeName + '|' + diffName;
        slotMap[key] = {
          type: typeName,
          difficulty: diffName,
          eligibleCount: eligible.length,
          eligibleIds: eligible.map(q => q.id),
          marksNeeded: diffMarks,
          byVariant: {},
        };
      }
    }

    return slotMap;
  }

  _populateSlotSelection(slotMap, label, questions) {
    for (const q of questions) {
      const key = q.questionType + '|' + q.difficulty;
      if (slotMap[key]) {
        if (!slotMap[key].byVariant[label]) {
          slotMap[key].byVariant[label] = [];
        }
        slotMap[key].byVariant[label].push(q.id);
      }
    }
  }

  _mergeSlotMaps(slotMaps) {
    if (slotMaps.length === 0) return {};
    const merged = {};
    for (const key of Object.keys(slotMaps[0])) {
      merged[key] = {
        type: slotMaps[0][key].type,
        difficulty: slotMaps[0][key].difficulty,
        eligibleCount: slotMaps[0][key].eligibleCount,
        eligibleIds: slotMaps[0][key].eligibleIds,
        marksNeeded: slotMaps[0][key].marksNeeded,
        byVariant: {},
      };
      for (const sm of slotMaps) {
        for (const label of Object.keys(sm[key].byVariant)) {
          if (!merged[key].byVariant[label]) {
            merged[key].byVariant[label] = [];
          }
          merged[key].byVariant[label] = merged[key].byVariant[label].concat(sm[key].byVariant[label]);
        }
      }
    }
    return merged;
  }

  /**
   * Calculate overlap percentage between each pair of papers.
   */
  _calculateSimilarity(papers) {
    const results = [];
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const idsA = new Set(papers[i].questions.map(function(q) { return q.id; }));
        const idsB = new Set(papers[j].questions.map(function(q) { return q.id; }));
        const overlap = [];
        for (const id of idsA) {
          if (idsB.has(id)) overlap.push(id);
        }
        const total = Math.max(idsA.size, idsB.size);
        const pct = total > 0 ? Math.round((overlap.length / total) * 100) : 0;
        results.push({
          pair: papers[i].label + ' vs ' + papers[j].label,
          overlap: pct,
        });
      }
    }
    return results;
  }

  // ── Pool filtering ──

  _filterPool(blueprint) {
    const curriculum = blueprint.curriculum || {};
    return this.bank.filter({
      board: curriculum.board || null,
      class: curriculum.class ? parseInt(curriculum.class, 10) : null,
      subject: curriculum.subject || null,
      chapters: curriculum.chapters || [],
    });
  }

  // ── Type mapping ──

  _buildTypeMap(qtDist, totalMarks) {
    const blueprintToModel = {
      mcq: 'MCQ',
      short: 'Short Answer',
      long: 'Long Answer',
      caseStudy: 'Long Answer',
      numerical: 'Short Answer',
    };

    const map = {};
    let usedPct = 0;

    for (const [key, pct] of Object.entries(qtDist)) {
      if (pct <= 0) continue;
      const typeName = blueprintToModel[key];
      if (!typeName) continue;
      if (!map[typeName]) map[typeName] = { typeName, marksNeeded: 0 };
      map[typeName].marksNeeded += Math.round(totalMarks * pct / 100);
      usedPct += pct;
    }

    if (usedPct < 100 && totalMarks > 0) {
      const remainder = totalMarks - Object.values(map).reduce((s, t) => s + t.marksNeeded, 0);
      if (remainder > 0 && map['Short Answer']) {
        map['Short Answer'].marksNeeded += remainder;
      }
    }

    return Object.values(map);
  }

  _buildDifficultyBuckets(diffDist, marksNeeded) {
    const diffMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    const buckets = [];
    let totalPct = 0;

    for (const [key, pct] of Object.entries(diffDist)) {
      if (pct <= 0) continue;
      const diffName = diffMap[key];
      if (!diffName) continue;
      buckets.push({ diffName, diffMarks: Math.round(marksNeeded * pct / 100) });
      totalPct += pct;
    }

    if (totalPct < 100 && buckets.length > 0) {
      const allocated = buckets.reduce((s, b) => s + b.diffMarks, 0);
      const remainder = marksNeeded - allocated;
      if (remainder > 0) {
        buckets[buckets.length - 1].diffMarks += remainder;
      }
    }

    return buckets;
  }

  // ── Organisation ──

  _sortByType(questions) {
    const order = { 'MCQ': 0, 'Short Answer': 1, 'Long Answer': 2 };
    return [...questions].sort((a, b) => {
      const ta = order[a.questionType] != null ? order[a.questionType] : 99;
      const tb = order[b.questionType] != null ? order[b.questionType] : 99;
      if (ta !== tb) return ta - tb;
      return a.id - b.id;
    });
  }

  _organizeByType(questions) {
    const sections = { 'MCQ': [], 'Short Answer': [], 'Long Answer': [] };
    for (const q of questions) {
      const key = q.questionType;
      if (sections[key]) {
        sections[key].push(q);
      } else {
        sections['Short Answer'].push(q);
      }
    }
    return sections;
  }

  // ── Compliance calculation ──

  _calculateCompliance(selected, blueprint, pool) {
    const totalMarks = blueprint.config.totalMarks || 0;
    const selectedMarks = selected.reduce((s, q) => s + q.marks, 0);

    const marksScore = totalMarks > 0
      ? Math.round(Math.min(selectedMarks / totalMarks, 1) * 100)
      : 0;

    const diffTarget = blueprint.difficulty || {};
    const typeTarget = blueprint.questionTypes || {};
    const diffTotal = (diffTarget.easy || 0) + (diffTarget.medium || 0) + (diffTarget.hard || 0);
    const typeTotal = (typeTarget.mcq || 0) + (typeTarget.short || 0) + (typeTarget.long || 0)
      + (typeTarget.caseStudy || 0) + (typeTarget.numerical || 0);

    const actualDiffPcts = this._calcDistribution(selected, 'difficulty');
    const actualTypePcts = this._calcDistribution(selected, 'questionType');

    const diffScore = this._matchScore(
      { Easy: diffTarget.easy || 0, Medium: diffTarget.medium || 0, Hard: diffTarget.hard || 0 },
      actualDiffPcts,
      diffTotal
    );

    const typeModelMap = {
      mcq: 'MCQ', short: 'Short Answer', long: 'Long Answer',
      caseStudy: 'Long Answer', numerical: 'Short Answer'
    };
    const typeTargetNormalized = {};
    for (const [key, val] of Object.entries(typeTarget)) {
      const mapped = typeModelMap[key];
      if (mapped) typeTargetNormalized[mapped] = (typeTargetNormalized[mapped] || 0) + val;
    }

    const typeScore = this._matchScore(typeTargetNormalized, actualTypePcts, typeTotal);

    return {
      marksMatch: marksScore,
      difficultyMatch: diffScore,
      typeMatch: typeScore,
      selectedMarks: selectedMarks,
      targetMarks: totalMarks,
      actualDifficulty: actualDiffPcts,
      actualTypes: actualTypePcts,
    };
  }

  _calcDistribution(questions, key) {
    const counts = {};
    let total = 0;
    for (const q of questions) {
      const val = key === 'difficulty' ? q.difficulty : q.questionType;
      counts[val] = (counts[val] || 0) + (q.marks || 0);
      total += q.marks || 0;
    }
    const pcts = {};
    for (const [k, v] of Object.entries(counts)) {
      pcts[k] = total > 0 ? Math.round((v / total) * 100) : 0;
    }
    return pcts;
  }

  _matchScore(target, actual, totalTarget) {
    if (totalTarget <= 0) return 100;
    let totalDiff = 0;
    let count = 0;

    const allKeys = new Set([...Object.keys(target), ...Object.keys(actual)]);
    for (const key of allKeys) {
      const tPct = (target[key] || 0);
      const aPct = (actual[key] || 0);
      totalDiff += Math.abs(tPct - aPct);
      count++;
    }

    if (count === 0) return 100;
    const avgDiff = totalDiff / count;
    const score = Math.max(0, Math.round(100 - avgDiff));
    return Math.min(100, score);
  }

  /**
   * Analyze why the blueprint was not fully satisfied.
   */
  _analyzeFailures(compliance, blueprint, pool, selected) {
    const reasons = [];
    const totalMarks = blueprint.config.totalMarks || 0;

    if (compliance.selectedMarks < totalMarks) {
      reasons.push({
        type: 'marks_shortfall',
        message: 'Insufficient eligible questions in the question bank.',
        detail: 'Required ' + totalMarks + ' marks, but only ' + compliance.selectedMarks + ' marks could be selected from the available questions.',
      });
    }

    if (compliance.difficultyMatch < 100) {
      const diffTarget = blueprint.difficulty || {};
      const diffSummary = Object.entries(diffTarget)
        .filter(function(kv) { return kv[1] > 0; })
        .map(function(kv) { return kv[0] + ' ' + kv[1] + '%'; })
        .join(', ');
      reasons.push({
        type: 'difficulty_mismatch',
        message: 'Could not match the exact difficulty distribution.',
        detail: 'Target: ' + diffSummary + '. Actual distribution differs.',
      });
    }

    if (compliance.typeMatch < 100) {
      reasons.push({
        type: 'type_mismatch',
        message: 'Could not match the exact question type distribution.',
        detail: 'The available questions do not perfectly match the required MCQ / Short Answer / Long Answer split.',
      });
    }

    return reasons;
  }

  _emptyResult(message) {
    return {
      questions: [],
      sections: { 'MCQ': [], 'Short Answer': [], 'Long Answer': [] },
      compliance: {
        marksMatch: 0, difficultyMatch: 0, typeMatch: 0,
        selectedMarks: 0, targetMarks: 0,
        actualDifficulty: {}, actualTypes: {},
        reasons: [{
          type: 'empty_pool',
          message: 'No questions found matching the selected criteria.',
          detail: 'The question bank contains no questions for the selected board, class, subject, or chapters.',
        }],
      },
      totalMarksSelected: 0,
      totalQuestionsSelected: 0,
      errors: [message],
      warnings: [],
    };
  }
}
