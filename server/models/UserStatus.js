import mongoose from "mongoose";

const UserStatusSchema=new mongoose.Schema({
    username:String,
    booked:[],
    locked:[],
});

const UserStatus=mongoose.model(UserStatusSchema);

export default UserStatus;