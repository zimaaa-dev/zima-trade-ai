import importlib
import sys
import types


def install_optional_dependency_stubs() -> None:
    """
    Lightweight fallback stubs ONLY when pydantic / pydantic_settings / aiohttp
    are not installed in a minimal container. On VPS with full venv, real libs load.
    """
    if "pydantic" not in sys.modules:
        try:
            importlib.import_module("pydantic")
        except ImportError:
            pydantic_mod = types.ModuleType("pydantic")

            def Field(default=None, **_kwargs):
                return default

            class BaseModel:
                def __init__(self, **kwargs):
                    annotations = getattr(self.__class__, "__annotations__", {})
                    for key in annotations:
                        if key in kwargs:
                            val = kwargs[key]
                        elif hasattr(self.__class__, key):
                            val = getattr(self.__class__, key)
                        else:
                            val = None
                        setattr(self, key, val)
                    for key, val in kwargs.items():
                        setattr(self, key, val)

                def model_dump(self):
                    return dict(self.__dict__)

                def dict(self):
                    return dict(self.__dict__)

            pydantic_mod.BaseModel = BaseModel
            pydantic_mod.Field = Field
            sys.modules["pydantic"] = pydantic_mod

    if "pydantic_settings" not in sys.modules:
        try:
            importlib.import_module("pydantic_settings")
        except ImportError:
            ps_mod = types.ModuleType("pydantic_settings")

            class BaseSettings:
                def __init__(self, **kwargs):
                    for cls in reversed(self.__class__.__mro__):
                        for key, val in cls.__dict__.items():
                            if (
                                not key.startswith("_")
                                and key != "Config"
                                and not isinstance(val, (property, types.FunctionType, classmethod, staticmethod))
                            ):
                                setattr(self, key, val)
                    for key, val in kwargs.items():
                        setattr(self, key, val)

            ps_mod.BaseSettings = BaseSettings
            sys.modules["pydantic_settings"] = ps_mod

    if "aiohttp" not in sys.modules:
        try:
            importlib.import_module("aiohttp")
        except ImportError:
            aiohttp_mod = types.ModuleType("aiohttp")

            class ClientSession:
                pass

            aiohttp_mod.ClientSession = ClientSession
            sys.modules["aiohttp"] = aiohttp_mod

    if "numpy" not in sys.modules:
        try:
            importlib.import_module("numpy")
        except ImportError:
            np_mod = types.ModuleType("numpy")
            np_mod.ndarray = object
            np_mod.argmax = lambda arr: 0
            sys.modules["numpy"] = np_mod


install_optional_dependency_stubs()
