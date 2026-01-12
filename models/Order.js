const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    product: {
        name: { type: String, required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        price: { type: Number, required: true },
        category: { type: String, required: true }
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Processing', 'Shipped', 'Delivered', 'Rejected'],
        default: 'Pending'
    },
    orderDate: {
        type: Date,
        default: Date.now
    },
    estimatedDelivery: Date,
    actualDelivery: Date,
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    totalAmount: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
