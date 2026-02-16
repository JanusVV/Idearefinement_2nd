/**
 * Open Source Scout worker.
 * Searches GitHub for relevant open source repos, libraries, and similar projects
 * that could serve as building blocks, references, or inspiration for the project idea.
 *
 * Flow:
 *   1. Use LLM to extract search queries from the project snapshot.
 *   2. Hit GitHub Search API with those queries.
 *   3. Use LLM to curate and rank results by relevance.
 *
 * If agentConfig has model + apiKeyEnvVar → calls LLM for intelligent discovery.
 * Otherwise falls back to a basic keyword search with raw results.
 */

const llm = require('../llmClient');
const { createScopedLogger } = require('../logger');
const log = createScopedLogger('Worker:OSSDiscovery');

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';
const GITHUB_USER_AGENT = 'IdeaRefinement-OSSScout/1.0';
const MAX_QUERIES = 3;
const RESULTS_PER_QUERY = 10;
const MAX_REPOS_TO_ANALYZE = 15;

const QUERY_EXTRACTION_PROMPT = `You are a search query generator. Given a product idea, generate ${MAX_QUERIES} distinct GitHub search queries that would find:
1. Open source projects solving a similar problem
2. Libraries or frameworks that could be used as building blocks
3. Reference implementations or boilerplates in a relevant tech stack

Return your answer as a JSON array of strings (no markdown fences):
["query one", "query two", "query three"]

Keep queries concise (2-5 words each). Focus on the core technical problem, not the product name.`;

const CURATION_PROMPT = `You are an open source technology scout. Given a product idea and a list of GitHub repositories, analyze which ones are most relevant and useful.

For each relevant repository, explain:
- Why it's relevant to this project
- How it could be used (as a base, as a library, as a reference, etc.)
- Any caveats (license, maintenance status, complexity)

Return your answer in this exact JSON format (no markdown fences):
{
  "summary": "One paragraph overview of what's available in the open source ecosystem for this idea",
  "repositories": [
    {
      "name": "owner/repo",
      "url": "https://github.com/owner/repo",
      "stars": 1234,
      "description": "Repo's own description",
      "relevance": "High|Medium|Low",
      "useCase": "How this could be used for the project (one sentence)",
      "license": "MIT"
    }
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ],
  "suggestedStack": "Brief suggestion of tech stack based on what's available"
}

Only include repositories that are genuinely relevant. Limit to the top 8 most useful ones.
Rank by relevance (High first, then Medium). Omit Low-relevance repos unless very few results.`;

/**
 * Search GitHub repositories using the public search API.
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of repo objects
 */
async function searchGitHub(query) {
  const params = new URLSearchParams({
    q: query,
    sort: 'stars',
    order: 'desc',
    per_page: String(RESULTS_PER_QUERY),
  });

  const url = `${GITHUB_SEARCH_URL}?${params}`;
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': GITHUB_USER_AGENT,
  };

  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) {
    headers.Authorization = `Bearer ${ghToken}`;
  }

  log.debug('GitHub search', { query, hasToken: !!ghToken });

  try {
    const res = await fetch(url, { headers });

    if (res.status === 403 || res.status === 429) {
      log.warn('GitHub rate limit hit', { status: res.status, query });
      return [];
    }
    if (!res.ok) {
      log.warn('GitHub search failed', { status: res.status, query });
      return [];
    }

    const body = await res.json();
    return (body.items || []).map((repo) => ({
      name: repo.full_name,
      url: repo.html_url,
      description: (repo.description || '').slice(0, 200),
      stars: repo.stargazers_count,
      language: repo.language,
      license: repo.license?.spdx_id || 'Unknown',
      updatedAt: repo.updated_at,
      topics: (repo.topics || []).slice(0, 5),
      archived: repo.archived,
    }));
  } catch (err) {
    log.error('GitHub search error', { query, error: err.message });
    return [];
  }
}

/**
 * Build a compact text summary of repos for the LLM to analyze.
 */
function formatReposForLLM(repos) {
  return repos
    .map(
      (r, i) =>
        `${i + 1}. ${r.name} (${r.stars}★, ${r.language || 'N/A'}, ${r.license})${r.archived ? ' [ARCHIVED]' : ''}\n` +
        `   ${r.url}\n` +
        `   ${r.description || '(no description)'}\n` +
        `   Topics: ${r.topics.length ? r.topics.join(', ') : 'none'}\n` +
        `   Last updated: ${r.updatedAt ? r.updatedAt.slice(0, 10) : 'unknown'}`
    )
    .join('\n\n');
}

async function run(project, options = {}) {
  const agentConfig = options.agentConfig || {};
  const snapshot = (project.snapshot || '').slice(0, 800);
  const projectName = project.name || 'Unnamed project';
  const taskDescription = options.taskDescription || '';
  const configured = llm.isConfigured(agentConfig);

  log.info('Starting OSS discovery', {
    projectName,
    configured,
    model: agentConfig.model || '(none)',
    snapshotLen: snapshot.length,
  });

  if (!snapshot && !taskDescription) {
    log.warn('No snapshot or task description provided');
    return {
      structuredResult: {
        summary: 'No project description available to search for open source resources.',
        repositories: [],
        recommendations: ['Add a project snapshot or description first, then run OSS discovery again.'],
      },
      confidence: 0.2,
      suggestedPatch: {},
    };
  }

  const ideaText = snapshot || taskDescription;
  let searchQueries = [];

  if (configured) {
    try {
      const queryPrompt = `Product idea: ${ideaText}\n${taskDescription ? 'Specific focus: ' + taskDescription : ''}\n\nGenerate the search queries.`;
      const raw = await llm.chat(agentConfig, [
        { role: 'system', content: QUERY_EXTRACTION_PROMPT },
        { role: 'user', content: queryPrompt },
      ]);
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        searchQueries = JSON.parse(match[0]).filter((q) => typeof q === 'string').slice(0, MAX_QUERIES);
      }
    } catch (err) {
      log.warn('LLM query extraction failed, falling back to keyword extraction', { error: err.message });
    }
  }

  if (searchQueries.length === 0) {
    const words = ideaText
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6);
    searchQueries = [words.slice(0, 3).join(' '), words.slice(2, 5).join(' ')].filter((q) => q.trim().length > 0);
    log.info('Using fallback keyword queries', { queries: searchQueries });
  }

  log.info('Search queries generated', { queries: searchQueries });

  const allRepos = [];
  const seenNames = new Set();

  for (const query of searchQueries) {
    const repos = await searchGitHub(query);
    for (const repo of repos) {
      if (!seenNames.has(repo.name) && !repo.archived) {
        seenNames.add(repo.name);
        allRepos.push(repo);
      }
    }
  }

  log.info('GitHub search complete', { totalUniqueRepos: allRepos.length, queries: searchQueries.length });

  if (allRepos.length === 0) {
    return {
      structuredResult: {
        summary: 'No relevant open source repositories found on GitHub for this idea.',
        repositories: [],
        recommendations: ['Try refining your project description with more technical details.'],
        searchQueries,
      },
      confidence: 0.3,
      suggestedPatch: {},
    };
  }

  const topRepos = allRepos
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS_TO_ANALYZE);

  if (!configured) {
    log.info('LLM not configured, returning raw GitHub results');
    return {
      structuredResult: {
        summary: `Found ${topRepos.length} potentially relevant open source repositories. Configure an LLM on this agent for intelligent curation and recommendations.`,
        repositories: topRepos.map((r) => ({
          name: r.name,
          url: r.url,
          stars: r.stars,
          description: r.description,
          relevance: 'Unknown',
          useCase: 'Review manually',
          license: r.license,
        })),
        recommendations: ['Configure an LLM model and API key on the Open Source Scout agent for curated recommendations.'],
        searchQueries,
      },
      confidence: 0.4,
      suggestedPatch: {},
    };
  }

  const repoText = formatReposForLLM(topRepos);
  const curationPrompt =
    `Product idea: ${ideaText}\nProject name: ${projectName}\nTrack: ${project.track || 'Personal'}\n` +
    `${taskDescription ? 'Specific focus: ' + taskDescription + '\n' : ''}` +
    `\nHere are the GitHub repositories found:\n\n${repoText}\n\n` +
    `Analyze these and produce the curated JSON response.`;

  let parsed = null;
  try {
    const raw = await llm.chat(agentConfig, [
      { role: 'system', content: CURATION_PROMPT },
      { role: 'user', content: curationPrompt },
    ]);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    log.warn('LLM curation failed', { error: err.message });
  }

  if (parsed) {
    parsed.searchQueries = searchQueries;
    return {
      structuredResult: parsed,
      confidence: 0.8,
      suggestedPatch: {
        validationPlan:
          (project.validationPlan || '') +
          '\n- [x] Open source discovery completed via ' +
          (agentConfig.model || 'LLM') +
          '. Found ' +
          (parsed.repositories?.length || 0) +
          ' relevant repos.',
      },
    };
  }

  return {
    structuredResult: {
      summary: `Found ${topRepos.length} potentially relevant repositories but LLM curation failed. Showing raw results.`,
      repositories: topRepos.map((r) => ({
        name: r.name,
        url: r.url,
        stars: r.stars,
        description: r.description,
        relevance: 'Unknown',
        useCase: 'Review manually',
        license: r.license,
      })),
      recommendations: ['LLM curation failed. Review repositories manually or retry.'],
      searchQueries,
    },
    confidence: 0.5,
    suggestedPatch: {
      validationPlan:
        (project.validationPlan || '') +
        '\n- [x] Open source discovery completed (raw results, curation failed).',
    },
  };
}

module.exports = { run };
