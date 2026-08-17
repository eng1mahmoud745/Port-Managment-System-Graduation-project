function blockSupervisorWarehouseLocationMutation(req, res, next) {
    const normalizedRole = String(req.authSession?.role || '').trim().toLowerCase();

    if (normalizedRole === 'supervisor') {
        return res.status(403).json({
            success: false,
            message: 'لا يُسمح للمشرف بإضافة أو تعديل أو حذف المستودعات والمواقع.'
        });
    }

    return next();
}

module.exports = {
    blockSupervisorWarehouseLocationMutation
};
