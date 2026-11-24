/**
 * Push alerts via ntfy.sh (https://ntfy.sh) — a free service that turns an
 * HTTP POST into a phone notification for anyone subscribed to the topic.
 *
 * Off unless NTFY_TOPIC is set, so a fresh install never posts anywhere.
 * Never throws: an alert that can't be delivered must not break a request.
 */

/**
 * Send a push alert.
 * @param {object} alert
 * @param {string} alert.title - ASCII only (it travels in an HTTP header).
 * @param {string} alert.message
 * @param {string} [alert.priority='default'] - ntfy priority: min|low|default|high|urgent.
 * @param {string} [alert.tags] - comma-separated ntfy tags (rendered as emoji).
 * @param {object} [deps] - injectable for tests.
 * @returns {Promise<boolean>} true if the alert was accepted by ntfy.
 */
async function notify(
  { title, message, priority = 'default', tags },
  { topic = process.env.NTFY_TOPIC, fetchImpl = fetch } = {}
) {
  if (!topic) return false;
  try {
    const headers = { Title: title, Priority: priority };
    if (tags) headers.Tags = tags;
    const res = await fetchImpl(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers,
      body: message,
    });
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`[notify] alert not sent ("${title}"): ${err.message}`);
    return false;
  }
}

module.exports = { notify };
