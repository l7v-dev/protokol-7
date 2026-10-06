"""Choose restart indexes without replacing an orphaned local shard."""

import re
from pathlib import Path


def next_part_index(output_dir, prefix, minimum=0):
    directory = Path(output_dir)
    if not directory.exists():
        return minimum
    pattern = re.compile(re.escape(prefix) + r"_\d{8}_p(\d+)\.")
    indexes = [int(match.group(1)) for path in directory.iterdir()
               if (match := pattern.match(path.name)) is not None]
    return max([minimum, *(index + 1 for index in indexes)])
