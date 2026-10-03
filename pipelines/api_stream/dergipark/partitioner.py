#!/usr/bin/env python3
"""
DergiPark Harvest Partitioner -- protokol-7

Generates chronological, density-optimized date window partitions for
the DergiPark OAI-PMH service to circumvent deep pagination resumption limits
and harvest the entire 800K+ academic article repository deterministically.
"""

import datetime
from typing import Dict, List, Optional


class DergiParkPartitioner:
    """
    Constructs deterministic date ranges for partitioning OAI-PMH queries.
    """

    @staticmethod
    def generate_date_partitions(
        start_year: int = 1970,
        end_year: Optional[int] = None,
        mode: str = "auto",
    ) -> List[Dict[str, str]]:
        """
        Generates contiguous, non-overlapping date partitions.
        
        Modes:
          - 'auto': Density-adaptive (pre-2000 in bulk/5-yr, 2000-2009 in 2-yr,
                    2010-2017 in 1-yr, 2018-present in 6-month windows).
          - 'year': Pure 1-year windows.
          - 'half_year': 6-month windows.
        """
        current_year = datetime.datetime.now(datetime.timezone.utc).year
        target_end_year = end_year or current_year

        if start_year > target_end_year:
            raise ValueError(f"start_year ({start_year}) cannot be greater than end_year ({target_end_year})")

        partitions: List[Dict[str, str]] = []

        if mode == "auto":
            # 1. Pre-1970 archive if start_year < 1970
            if start_year < 1970:
                partitions.append({
                    "partition_id": "dp_date_1900-01-01_1969-12-31",
                    "from_date": "1900-01-01",
                    "until_date": "1969-12-31",
                    "label": "Archive (pre-1970)",
                })
                current_cursor_year = 1970
            else:
                current_cursor_year = start_year

            # 2. 1970 to 1999 (5-year windows)
            while current_cursor_year < 2000 and current_cursor_year <= target_end_year:
                block_end = min(current_cursor_year + 4, 1999, target_end_year)
                partitions.append({
                    "partition_id": f"dp_date_{current_cursor_year}-01-01_{block_end}-12-31",
                    "from_date": f"{current_cursor_year}-01-01",
                    "until_date": f"{block_end}-12-31",
                    "label": f"{current_cursor_year}-{block_end}",
                })
                current_cursor_year = block_end + 1

            # 3. 2000 to 2009 (2-year windows)
            while current_cursor_year < 2010 and current_cursor_year <= target_end_year:
                block_end = min(current_cursor_year + 1, 2009, target_end_year)
                partitions.append({
                    "partition_id": f"dp_date_{current_cursor_year}-01-01_{block_end}-12-31",
                    "from_date": f"{current_cursor_year}-01-01",
                    "until_date": f"{block_end}-12-31",
                    "label": f"{current_cursor_year}-{block_end}",
                })
                current_cursor_year = block_end + 1

            # 4. 2010 to 2017 (1-year windows)
            while current_cursor_year < 2018 and current_cursor_year <= target_end_year:
                partitions.append({
                    "partition_id": f"dp_date_{current_cursor_year}-01-01_{current_cursor_year}-12-31",
                    "from_date": f"{current_cursor_year}-01-01",
                    "until_date": f"{current_cursor_year}-12-31",
                    "label": f"{current_cursor_year}",
                })
                current_cursor_year += 1

            # 5. 2018 to target_end_year (6-month windows for high publication density)
            while current_cursor_year <= target_end_year:
                # H1
                partitions.append({
                    "partition_id": f"dp_date_{current_cursor_year}-01-01_{current_cursor_year}-06-30",
                    "from_date": f"{current_cursor_year}-01-01",
                    "until_date": f"{current_cursor_year}-06-30",
                    "label": f"{current_cursor_year}-H1",
                })
                # H2
                partitions.append({
                    "partition_id": f"dp_date_{current_cursor_year}-07-01_{current_cursor_year}-12-31",
                    "from_date": f"{current_cursor_year}-07-01",
                    "until_date": f"{current_cursor_year}-12-31",
                    "label": f"{current_cursor_year}-H2",
                })
                current_cursor_year += 1

        elif mode == "year":
            for y in range(start_year, target_end_year + 1):
                partitions.append({
                    "partition_id": f"dp_date_{y}-01-01_{y}-12-31",
                    "from_date": f"{y}-01-01",
                    "until_date": f"{y}-12-31",
                    "label": f"{y}",
                })

        elif mode == "half_year":
            for y in range(start_year, target_end_year + 1):
                partitions.append({
                    "partition_id": f"dp_date_{y}-01-01_{y}-06-30",
                    "from_date": f"{y}-01-01",
                    "until_date": f"{y}-06-30",
                    "label": f"{y}-H1",
                })
                partitions.append({
                    "partition_id": f"dp_date_{y}-07-01_{y}-12-31",
                    "from_date": f"{y}-07-01",
                    "until_date": f"{y}-12-31",
                    "label": f"{y}-H2",
                })

        else:
            raise ValueError(f"Unknown partition mode: {mode}")

        return partitions
