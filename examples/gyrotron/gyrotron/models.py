"""Record one gyrotron shot and its independent custom parameters."""
from __future__ import annotations
from datetime import date as DateValue
from decimal import Decimal
from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Shot(Base):
    __tablename__ = "shot_records"
    __table_args__ = (UniqueConstraint("Serial", "shot", name="uq_shot_serial_number"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    Serial: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    shot: Mapped[int] = mapped_column(BigInteger, nullable=False)
    iplen: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Uc: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Ua: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Ib: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Im: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Pf: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Ic: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Pw: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    Pc: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[DateValue | None] = mapped_column(Date, nullable=True)
    custom_parameters: Mapped[list[CustomParameter]] = relationship(
        "CustomParameter", back_populates="parent", cascade="all, delete-orphan",
        order_by="CustomParameter.id",
    )
    def __str__(self) -> str:
        return f"{self.Serial} / {self.shot}"

class CustomParameter(Base):
    __tablename__ = "shot_custom_parameters"
    __table_args__ = (UniqueConstraint("shot_id", "name", name="uq_custom_parameter_per_shot"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[int] = mapped_column(
        ForeignKey("shot_records.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(60), nullable=True)
    data_type: Mapped[str] = mapped_column(String(24), nullable=False, default="DECIMAL")
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent: Mapped[Shot] = relationship("Shot", back_populates="custom_parameters")
    def __str__(self) -> str:
        return self.description or self.name
