import Bus from "@/components/bus";

const Book=()=>{
    let busNo=1;
    return (
        <>
            <div>Bookings</div>
                <Bus busNo={busNo}></Bus>
        </>
    )
};

export default Book;