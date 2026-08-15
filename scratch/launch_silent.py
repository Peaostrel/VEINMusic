import sys
import traceback

sys.path.insert(0, "e:\\VEIN\\VEINMusic")

try:
    from desktop_client.main import main
    main()
except Exception:
    with open("e:\\VEIN\\VEINMusic\\scratch\\client.log", "w", encoding="utf-8") as f:
        traceback.print_exc(file=f)
