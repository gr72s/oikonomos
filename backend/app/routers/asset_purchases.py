from fastapi import APIRouter

from app.models import AssetPurchaseResultDto, CreateAssetPurchaseInput
from app.services.finance import create_asset_purchase

router = APIRouter(prefix="/asset-purchases", tags=["asset-purchases"])


@router.post("", response_model=AssetPurchaseResultDto)
def post_asset_purchase(input_data: CreateAssetPurchaseInput) -> AssetPurchaseResultDto:
    return create_asset_purchase(input_data)
