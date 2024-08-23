import Bus from "@/components/bus";

const Book=()=>{
    let busNo=10;
    return (
        <>
            <div>Bookings</div>
            <div className="flex flex-wrap gap-5">
                {
                    [...Array(10)].map((_,ind)=>(
                        <Bus key={ind} busNo={ind+1} rows={15} cols={5}></Bus>
                    ))
                }
            </div>
        </>
    )
};

export default Book;