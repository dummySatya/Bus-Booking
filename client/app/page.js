"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const [username,setUsername]=useState("");
  const router = useRouter();
  const handleSubmit=(e)=>{
    e.preventDefault();
    if(username){
      localStorage.setItem("username",username);
      console.log(localStorage.getItem("username"));
      router.push("/book");
    }
  }
  return (
    <>
      <div className="text-4xl text-center my-3">Bus Booking System</div>
      <form onSubmit={handleSubmit} className=" h-80 flex flex-col items-center justify-center">
        <input onChange={(e)=>setUsername(e.target.value)} className="border rounded p-2" placeholder="Enter username"></input>
        <button className="border-orange-600 w-20 p-2 rounded-2xl shadow m-3 bg-blue-400">Start</button>
      </form>
    </>
  );
}
