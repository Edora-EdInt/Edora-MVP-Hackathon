/**
 * QuestionBank — Data-source agnostic question repository.
 *
 * Provides filtering, searching, and statistics over a question collection.
 * Designed to be interchangeable with any data source (JSON, API, OpenClaw, etc.)
 * without changing the consuming code (QuestionSelector, UI).
 *
 * @class QuestionBank
 */
class QuestionBank {
  /**
   * @param {Array<Object>} questions — Array of question objects.
   */
  constructor(questions) {
    this.questions = questions || [];
    this._index = this._buildIndex();
  }

  /** @returns {Array<Object>} All questions. */
  getAll() {
    return this.questions;
  }

  /**
   * Retrieve a single question by its id.
   * @param {number|string} id
   * @returns {Object|undefined}
   */
  getById(id) {
    return this._index[id] || this.questions.find(q => q.id === id);
  }

  /**
   * Filter questions by one or more criteria.
   * Only non-null/defined/empty filter values are applied.
   *
   * @param {Object} filters
   * @param {string} [filters.board]
   * @param {number} [filters.class]
   * @param {string} [filters.subject]
   * @param {string[]} [filters.chapters] — Only questions whose chapter is in this list.
   * @param {string} [filters.difficulty]
   * @param {string} [filters.questionType] — "MCQ", "Short Answer", "Long Answer"
   * @returns {Array<Object>} Filtered question array.
   */
  filter(filters = {}) {
    return this.questions.filter(q => {
      if (filters.board && q.board !== filters.board) return false;
      if (filters.class != null && q.class !== filters.class) return false;
      if (filters.subject && q.subject !== filters.subject) return false;
      if (filters.chapters && filters.chapters.length > 0 && !filters.chapters.includes(q.chapter)) return false;
      if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
      if (filters.questionType && q.questionType !== filters.questionType) return false;
      return true;
    });
  }

  /**
   * Full-text search across question text, chapter, and subject.
   * @param {string} query
   * @returns {Array<Object>}
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.questions;
    return this.questions.filter(item =>
      item.question.toLowerCase().includes(q) ||
      item.chapter.toLowerCase().includes(q) ||
      item.subject.toLowerCase().includes(q)
    );
  }

  /**
   * Get aggregate statistics about the question bank.
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.questions.length,
      bySubject: this._groupBy('subject'),
      byDifficulty: this._groupBy('difficulty'),
      byType: this._groupBy('questionType'),
      byChapter: this._groupBy('chapter'),
      totalMarks: this.questions.reduce((s, q) => s + (q.marks || 0), 0),
    };
  }

  /**
   * Return a new QuestionBank with the given questions (immutable-style filter).
   * Useful for building sub-banks.
   * @param {Array<Object>} subset
   * @returns {QuestionBank}
   */
  subset(subset) {
    return new QuestionBank(subset);
  }

  // ── Private helpers ──

  _buildIndex() {
    const idx = {};
    for (const q of this.questions) {
      idx[q.id] = q;
    }
    return idx;
  }

  _groupBy(key) {
    const map = {};
    for (const q of this.questions) {
      const val = q[key];
      map[val] = (map[val] || 0) + 1;
    }
    return map;
  }
}
