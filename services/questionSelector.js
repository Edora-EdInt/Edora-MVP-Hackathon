/**
 * QuestionSelector — Data-source agnostic selection engine.
 *
 * Given an ExamBlueprint and a QuestionBank, selects questions that best
 * match the blueprint's constraints (board, class, subject, chapters,
 * difficulty distribution, question type distribution, total marks).
 *
 * The engine treats the QuestionBank as an opaque interface (it only calls
 * `.filter()` and reads question properties), making it fully interchangeable
 * with any data source.
 *
 * @class QuestionSelector
 */
class QuestionSelector {
  /**
   * @param {QuestionBank} questionBank
   */
  constructor(questionBank) {
    this.bank = questionBank;
  }

  /**
   * Select questions matching the given blueprint.
   *
   * @param {Object} blueprint — An ExamBlueprint object.
   * @returns {Object} Selection result with questions, sections, compliance.
   */
  select(blueprint) {
    const pool = this._filterPool(blueprint);
    if (pool.length === 0) {
      return this._emptyResult('No questions found matching the selected criteria.');
    }

    const totalMarks = blueprint.config.totalMarks || 0;
    const diffDist = blueprint.difficulty || { easy: 30, medium: 50, hard: 20 };
    const qtDist = blueprint.questionTypes || { mcq: 30, short: 25, long: 20, caseStudy: 10, numerical: 15 };

    const typeMap = this._buildTypeMap(qtDist, totalMarks);
    const selected = [];
    const usedIds = new Set();

    for (const { typeName, marksNeeded } of Object.values(typeMap)) {
      if (marksNeeded <= 0) continue;

      const typeQuestions = pool.filter(q => q.questionType === typeName);
      const diffBuckets = this._buildDifficultyBuckets(diffDist, marksNeeded);

      for (const { diffName, diffMarks } of diffBuckets) {
        if (diffMarks <= 0) continue;

        const candidates = typeQuestions
          .filter(q => q.difficulty === diffName && !usedIds.has(q.id))
          .sort((a, b) => b.marks - a.marks);

        let remaining = diffMarks;
        let selectedFromBucket = [];

        for (const q of candidates) {
          if (q.marks <= remaining) {
            selectedFromBucket.push(q);
            usedIds.add(q.id);
            remaining -= q.marks;
          }
        }

        if (remaining > 0 && selectedFromBucket.length > 0) {
          const last = selectedFromBucket[selectedFromBucket.length - 1];
          if (remaining < last.marks) {
            remaining += last.marks;
            usedIds.delete(last.id);
            selectedFromBucket.pop();

            const smaller = candidates.filter(q =>
              q.difficulty === diffName &&
              !usedIds.has(q.id) &&
              q.marks <= remaining
            ).sort((a, b) => b.marks - a.marks);

            if (smaller.length > 0) {
              selectedFromBucket.push(smaller[0]);
              usedIds.add(smaller[0].id);
            }
          }
        }

        selected.push(...selectedFromBucket);
      }
    }

    const ordered = this._sortByType(selected);
    const sections = this._organizeByType(ordered);
    const compliance = this._calculateCompliance(ordered, blueprint, pool);

    return {
      questions: ordered,
      sections: sections,
      compliance: compliance,
      totalMarksSelected: ordered.reduce((s, q) => s + q.marks, 0),
      totalQuestionsSelected: ordered.length,
      errors: [],
    };
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

  _emptyResult(message) {
    return {
      questions: [],
      sections: { 'MCQ': [], 'Short Answer': [], 'Long Answer': [] },
      compliance: {
        marksMatch: 0, difficultyMatch: 0, typeMatch: 0,
        selectedMarks: 0, targetMarks: 0,
        actualDifficulty: {}, actualTypes: {},
      },
      totalMarksSelected: 0,
      totalQuestionsSelected: 0,
      errors: [message],
    };
  }
}
