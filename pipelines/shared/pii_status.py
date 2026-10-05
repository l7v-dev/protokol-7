"""Typed document privacy status for legacy Arrow writers; missing status remains unchecked."""

import pyarrow as pa

STATUSES = frozenset({"unchecked", "clear", "redacted", "quarantined"})


def with_pii_schema(schema):
    if "pii_status" in schema.names:
        if schema.field("pii_status").type != pa.string():
            raise ValueError("pii_status must be a string column")
        return schema
    return schema.append(pa.field("pii_status", pa.string()))


def with_pii_table(table, records=None):
    if records is not None:
        if len(records) != table.num_rows:
            raise ValueError("Privacy status row count mismatch")
        values = [record.get("pii_status", "unchecked") for record in records]
    elif "pii_status" in table.column_names:
        values = table.column("pii_status").to_pylist()
    else:
        values = ["unchecked"] * table.num_rows
    if any(not isinstance(value, str) or value not in STATUSES for value in values):
        raise ValueError("Invalid pii_status")
    column = pa.array(values, type=pa.string())
    if "pii_status" in table.column_names:
        return table.set_column(table.schema.get_field_index("pii_status"), "pii_status", column)
    return table.append_column("pii_status", column)
