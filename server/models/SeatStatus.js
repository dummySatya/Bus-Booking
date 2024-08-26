import mongoose from "mongoose";

const SeatStatusSchema=new mongoose.Schema({
    busNumber:String,
    seatNumber:String,
    seatStatus:String,
    time:{
        type:Date,
        default:Date.now
    }
});

const SeatStatus=mongoose.model(SeatStatusSchema);

export default SeatStatus;