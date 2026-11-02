# Manual declaration-boundary fixture: analyze in VS Code; do not execute.
from abc import ABC, abstractmethod


def identity(declaration):
    return declaration


print("AFTER identity")

limit = 42

print("AFTER limit")


def build(value=tuple((1, 2)), label=":"):
    return value


print("AFTER build")

config = {
    "message": ":",
    "values": [1, 2],
}

print("AFTER config")


def simple():
    return 1


print("AFTER simple")


@identity
async def async_build(value=tuple(), label=":"):
    return value


print("AFTER async_build")


class Worker:
    def read(self):
        return config

    def empty(self):
        pass


print("AFTER Worker")


class Base(ABC):
    @abstractmethod
    def run(self):
        pass


print("AFTER Base")


def placeholder():
    ...


print("AFTER placeholder")


def doc_only():
    """A real body containing only a docstring: keep this source intact."""


print("AFTER doc_only")


def later():
    return 7


print("AFTER later")
