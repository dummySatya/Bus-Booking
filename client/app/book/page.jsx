import Bus from "@/components/bus";

const Book=()=>{
    let busNo=1;
    return (
        <>
            <div>Bookings</div>
                <Bus busNo={busNo} rows={15} cols={5}></Bus>
        </>
    )
};

export default Book;