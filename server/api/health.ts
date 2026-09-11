/**
 * GET /api/health
 *
 * Deployed before any real logic, deliberately: if the deploy pipeline is going to
 * misbehave, it should do it while there are ten lines of code to debug rather than
 * three hundred.
 */
export function GET() {
  return Response.json({
    ok: true,
    service: 'whichcard-api',
    time: new Date().toISOString(),
  });
}
