from datetime import date
from fastapi import HTTPException

def validate_target(values):
    mode = values.get('target_mode') or 'none'
    if mode == 'price' and not (values.get('target_daily') and values['target_daily'] > 0):
        raise HTTPException(422, '目标金额必须大于 0')
    if mode == 'date':
        try:
            purchase = date.fromisoformat(str(values.get('purchase_date')))
            target = date.fromisoformat(str(values.get('target_date')))
        except (ValueError, TypeError):
            raise HTTPException(422, '按日期目标需要购买日期和目标日期')
        if target < purchase: raise HTTPException(422, '目标日期不能早于购买日期')
    if mode == 'custom' and (not values.get('target_quantity') or values['target_quantity'] <= 0 or not (values.get('target_unit') or '').strip()):
        raise HTTPException(422, '请填写大于 0 的目标数量和单位')
