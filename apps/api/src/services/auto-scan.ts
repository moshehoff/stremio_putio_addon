import { scanPutioLibrary, syncPutioLibrary, getPutioAccessToken } from '@putio-stremio/db';
import { createLogger, getEnv } from '@putio-stremio/shared';

const log = createLogger('auto-scan');

let scanning = false;

export function startAutoScan(): void {
  const env = getEnv();
  const intervalMinutes = env.AUTO_SCAN_INTERVAL_MINUTES;
  if (intervalMinutes <= 0) {
    log.info('Auto-scan disabled (AUTO_SCAN_INTERVAL_MINUTES=0)');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  log.info({ intervalMinutes }, 'Auto-scan enabled');

  const run = async () => {
    if (scanning) {
      log.debug('Auto-scan skipped — previous run still in progress');
      return;
    }

    scanning = true;
    try {
      const token = await getPutioAccessToken();
      if (!token) {
        log.debug('Auto-scan skipped — no Put.io token');
        return;
      }

      const result = await syncPutioLibrary({ putioToken: token });
      if (result.mode === 'noop') {
        log.debug('Auto-scan skipped — no Put.io events since last sync');
        return;
      }

      log.info(
        {
          username: result.username,
          mode: result.mode,
          filesFound: result.filesFound,
          filesUpserted: result.filesUpserted,
          filesUnchanged: result.filesUnchanged,
          filesRemoved: result.filesRemoved,
          enrichMovies: result.enrich?.moviesMatched,
          enrichCached: result.enrich
            ? result.enrich.moviesSkipped + result.enrich.unmatchedSkipped
            : undefined,
        },
        'Auto-scan completed',
      );
    } catch (error) {
      log.warn(
        { err: error },
        'Auto-scan failed',
      );
    } finally {
      scanning = false;
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, intervalMs);
}
