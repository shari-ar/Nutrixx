# Local catalog artifacts

This directory is the same-origin development and deployment location for
verified food-catalog artifacts. Generated `.json` and `.json.gz` release files
remain outside Git; the DevContainer retrieves and verifies the active release
here during startup.

The Web application downloads an artifact from this path only after the person
selects local installation. It verifies release integrity before writing the
reference cache in IndexedDB.

Production deployment supplies the approved immutable artifact at this same
path through release delivery infrastructure.
The tracked active-release descriptor lives in `apps/web/config/` and pins
the expected compressed artifact digest. The guarded publication command
copies reviewed release assets here before switching that descriptor.
Generated artifacts and receipts remain outside Git and are delivered through
immutable URLs for fresh development containers.
