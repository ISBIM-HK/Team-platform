"""Tenant repository."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.tenant import Tenant


class TenantRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, tenant_id: uuid.UUID) -> Tenant | None:
        return await self.session.get(Tenant, tenant_id)

    async def get_by_name(self, name: str) -> Tenant | None:
        stmt = select(Tenant).where(Tenant.name == name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, tenant: Tenant) -> Tenant:
        self.session.add(tenant)
        await self.session.flush()
        await self.session.refresh(tenant)
        return tenant
