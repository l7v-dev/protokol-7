"""Validate CLI resource bounds before opening catalogs or external clients."""
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class PipelineArguments(BaseModel):
    model_config = ConfigDict(extra='ignore', allow_inf_nan=False)
    workers: int = Field(default=1, gt=0)
    batch_size: int = Field(default=1, gt=0)
    max_shard_records: int = Field(default=1, gt=0)
    shard_size_mb: float = Field(default=1, gt=0)
    max_records: int = Field(default=0, ge=0)
    max_articles: int = Field(default=0, ge=0)
    max_files: int = Field(default=0, ge=0)
    rate_limit: float = Field(default=0, ge=0)
    min_free_disk_gb: float = Field(default=0, ge=0)
    target_gb: float = Field(default=10, gt=0)
    max_gb: float = Field(default=51, gt=0)
    pdf_archive_gb: float = Field(default=10, gt=0)
    max_pdf_archive_gb: float = Field(default=51, gt=0)
    max_pdf_archive_records: int | None = Field(default=None, gt=0)
    max_pdf_archive_mb: int | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def archive_bounds(self):
        if self.target_gb > self.max_gb or self.pdf_archive_gb > self.max_pdf_archive_gb:
            raise ValueError('Archive target exceeds maximum')
        return self


def validate_cli(parser, args):
    try:
        PipelineArguments.model_validate(vars(args))
    except ValidationError as error:
        parser.error('; '.join('.'.join(map(str, entry['loc'])) + ': ' + entry['msg'] for entry in error.errors(include_input=False)))
    return args
