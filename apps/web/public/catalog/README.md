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
